const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, VerificationCode } = require('../models/index');
const { sendVerificationEmail } = require('./emailService');
const { VERIFICATION_CODE_EXPIRES_MIN } = require('../config/constants');
const { generateCsrfToken } = require('../middleware/csrf');

const BCRYPT_ROUNDS = 12;
const COOLDOWN_MS = 30 * 1000; // 30 segundos entre reenvios

// EMAIL_VERIFICATION=off: conta já nasce verificada e o cadastro faz login direto.
// Usado na implantação de demonstração, que não tem um SMTP real configurado.
const verificationEnabled = () => process.env.EMAIL_VERIFICATION !== 'off';

// ── Helpers privados ─────────────────────────────────────────────────────────

function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function expiresAt() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + VERIFICATION_CODE_EXPIRES_MIN);
  return d;
}

async function createAndSendCode(user) {
  const code = generateCode();
  await VerificationCode.create({
    user_id: user.id,
    code,
    expires_at: expiresAt(),
    used: false,
  });
  await sendVerificationEmail(user.email, user.name, code);
}

function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url || null };
}

function withCsrf(token) {
  return { token, csrfToken: generateCsrfToken(token) };
}

// ── Serviços públicos ────────────────────────────────────────────────────────

async function register({ name, email, password, age }) {
  const existing = await User.findOne({ where: { email } });
  const verify = verificationEnabled();

  if (existing) {
    if (existing.email_verified || !verify) {
      const err = new Error('Este e-mail já está cadastrado.');
      err.status = 409;
      throw err;
    }
    await VerificationCode.update({ used: true }, { where: { user_id: existing.id, used: false } });
    await createAndSendCode(existing);
    return { userId: existing.id };
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.create({ name, email, password_hash, age, email_verified: !verify });

  if (!verify) {
    const token = generateToken(user);
    return { userId: user.id, ...withCsrf(token), user: safeUser(user) };
  }

  await createAndSendCode(user);
  return { userId: user.id };
}

async function verifyEmail(userId, code) {
  const now = new Date();

  const record = await VerificationCode.findOne({
    where: {
      user_id: userId,
      code,
      used: false,
      expires_at: { [Op.gt]: now },
    },
  });

  if (!record) {
    const err = new Error('Código inválido ou expirado.');
    err.status = 400;
    throw err;
  }

  await record.update({ used: true });

  const user = await User.findByPk(userId);
  if (!user) {
    const err = new Error('Código inválido ou expirado.');
    err.status = 400;
    throw err;
  }

  await user.update({ email_verified: true });

  const token = generateToken(user);
  return { ...withCsrf(token), user: safeUser(user) };
}

async function resendCode(userId) {
  const user = await User.findByPk(userId);
  if (!user) return; // silently ignore — does not leak user existence

  if (user.email_verified) {
    const err = new Error('E-mail já verificado.');
    err.status = 400;
    throw err;
  }

  const last = await VerificationCode.findOne({
    where: { user_id: userId },
    order: [['created_at', 'DESC']],
  });

  if (last) {
    const elapsed = Date.now() - new Date(last.created_at).getTime();
    if (elapsed < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      const err = new Error(`Aguarde ${remaining} segundo(s) antes de reenviar.`);
      err.status = 429;
      throw err;
    }
  }

  await VerificationCode.update({ used: true }, { where: { user_id: userId, used: false } });
  await createAndSendCode(user);
}

async function login(email, password) {
  const INVALID_MSG = 'Credenciais inválidas.';

  const user = await User.findOne({ where: { email } });

  if (!user) {
    // Executa bcrypt mesmo assim para tempo constante (evita timing attack)
    await bcrypt.compare(password, '$2b$12$invalidhashfortimingprotection000000000000000000000');
    const err = new Error(INVALID_MSG);
    err.status = 401;
    throw err;
  }

  if (!user.email_verified && verificationEnabled()) {
    const err = new Error('E-mail não verificado. Verifique sua caixa de entrada.');
    err.status = 403;
    err.needsVerification = true;
    err.userId = user.id;
    throw err;
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) {
    console.warn(`[Auth] Tentativa de login falha para email hash=${hashForLog(email)}`);
    const err = new Error(INVALID_MSG);
    err.status = 401;
    throw err;
  }

  const token = generateToken(user);
  return { ...withCsrf(token), user: safeUser(user) };
}

function hashForLog(email) {
  return crypto.createHash('sha256').update(email).digest('hex').slice(0, 10);
}

module.exports = { register, verifyEmail, resendCode, login };
