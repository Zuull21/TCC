/**
 * Testes de autenticação — usa jest.mock para isolar banco e e-mail.
 */
const request = require('supertest');

// ── Mocks declarados ANTES do require do app ──────────────────────────────────

jest.mock('../models/index', () => ({
  User: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
  },
  VerificationCode: {
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('../services/emailService', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

// ── Setup do ambiente de teste ────────────────────────────────────────────────

process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters-here';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';

const { app } = require('../../server');
const { User, VerificationCode } = require('../models/index');
const jwt = require('jsonwebtoken');

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockUser = (overrides = {}) => ({
  id: 1,
  name: 'João Turista',
  email: 'joao@email.com',
  password_hash: '$2b$12$testhashvalue000000000000000000000000000000000000000000',
  age: 25,
  email_verified: true,
  role: 'tourist',
  avatar_url: null,
  toJSON() { return { ...this }; },
  update: jest.fn().mockResolvedValue(true),
  ...overrides,
});

function validToken(user = mockUser()) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

beforeEach(() => jest.clearAllMocks());

// ── POST /api/auth/register ───────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  const validBody = {
    name: 'Maria Silva',
    email: 'maria@email.com',
    password: 'Senha123!',
    age: 22,
  };

  it('retorna 201 com userId ao registrar com sucesso', async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue(mockUser({ id: 42, email: 'maria@email.com', email_verified: false }));
    VerificationCode.create.mockResolvedValue({});

    const res = await request(app).post('/api/auth/register').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('userId');
    expect(res.body).toHaveProperty('message');
    expect(res.body).not.toHaveProperty('code'); // nunca vazar o código
  });

  it('retorna 422 se o nome for muito curto', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, name: 'Jo' });
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('details');
  });

  it('retorna 422 se o e-mail for inválido', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, email: 'nao-e-email' });
    expect(res.status).toBe(422);
  });

  it('retorna 422 se a senha não tiver letra maiúscula', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, password: 'semnenhuma1' });
    expect(res.status).toBe(422);
  });

  it('retorna 422 se a senha não tiver número', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, password: 'SemNumero!' });
    expect(res.status).toBe(422);
  });

  it('retorna 422 se a senha tiver menos de 8 caracteres', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, password: 'Ab1!' });
    expect(res.status).toBe(422);
  });

  it('retorna 422 se a idade for menor que 18', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, age: 17 });
    expect(res.status).toBe(422);
  });

  it('retorna 422 se a idade estiver ausente', async () => {
    const { age: _age, ...body } = validBody;
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(422);
  });

  it('retorna 409 se e-mail já estiver cadastrado e verificado', async () => {
    User.findOne.mockResolvedValue(mockUser({ email: 'maria@email.com', email_verified: true }));
    const res = await request(app).post('/api/auth/register').send(validBody);
    expect(res.status).toBe(409);
  });

  it('resenvia o código se o e-mail existe mas não foi verificado', async () => {
    const unverified = mockUser({ email_verified: false });
    User.findOne.mockResolvedValue(unverified);
    VerificationCode.update.mockResolvedValue([1]);
    VerificationCode.create.mockResolvedValue({});

    const res = await request(app).post('/api/auth/register').send(validBody);

    expect(res.status).toBe(201);
    expect(VerificationCode.create).toHaveBeenCalled();
  });
});

// ── POST /api/auth/verify-email ───────────────────────────────────────────────

describe('POST /api/auth/verify-email', () => {
  it('retorna 200 com token quando o código é válido', async () => {
    const user = mockUser();
    const record = { update: jest.fn().mockResolvedValue(true) };
    VerificationCode.findOne.mockResolvedValue(record);
    User.findByPk.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ userId: 1, code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('retorna 400 com mensagem genérica quando o código é inválido', async () => {
    VerificationCode.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ userId: 1, code: '000000' });

    expect(res.status).toBe(400);
    // Mensagem não revela se é o código ou o userId que está errado
    expect(res.body.error).toMatch(/inválido|expirado/i);
  });

  it('retorna 422 se o código não tiver 6 dígitos', async () => {
    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ userId: 1, code: '12345' });
    expect(res.status).toBe(422);
  });

  it('retorna 422 se o código contiver letras', async () => {
    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ userId: 1, code: '12345a' });
    expect(res.status).toBe(422);
  });

  it('retorna 400 quando o código está expirado (expires_at no passado)', async () => {
    // VerificationCode.findOne retorna null porque o código expirado não passa no filtro Op.gt
    VerificationCode.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ userId: 1, code: '999999' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inválido|expirado/i);
  });
});

// ── POST /api/auth/resend-code ────────────────────────────────────────────────

describe('POST /api/auth/resend-code', () => {
  it('retorna 200 mesmo se o userId não existir (não vaza existência)', async () => {
    User.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/auth/resend-code')
      .send({ userId: 9999 });
    expect(res.status).toBe(200);
  });

  it('retorna 400 se o usuário já estiver verificado', async () => {
    User.findByPk.mockResolvedValue(mockUser({ email_verified: true }));
    const res = await request(app)
      .post('/api/auth/resend-code')
      .send({ userId: 1 });
    expect(res.status).toBe(400);
  });

  it('retorna 429 se o último código foi enviado há menos de 30s', async () => {
    User.findByPk.mockResolvedValue(mockUser({ email_verified: false }));
    VerificationCode.findOne.mockResolvedValue({
      created_at: new Date(Date.now() - 10_000), // 10 segundos atrás
    });

    const res = await request(app)
      .post('/api/auth/resend-code')
      .send({ userId: 1 });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/aguarde/i);
  });

  it('envia novo código após cooldown expirar', async () => {
    User.findByPk.mockResolvedValue(mockUser({ email_verified: false }));
    VerificationCode.findOne.mockResolvedValue({
      created_at: new Date(Date.now() - 60_000), // 60 segundos atrás
    });
    VerificationCode.update.mockResolvedValue([1]);
    VerificationCode.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/auth/resend-code')
      .send({ userId: 1 });

    expect(res.status).toBe(200);
    expect(VerificationCode.create).toHaveBeenCalled();
  });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('retorna 403 com needsVerification quando e-mail não foi verificado', async () => {
    User.findOne.mockResolvedValue(mockUser({ email_verified: false }));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'joao@email.com', password: 'qualquercoisa' });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('needsVerification', true);
    expect(res.body).toHaveProperty('userId');
  });

  it('retorna 401 com mensagem genérica para senha errada', async () => {
    const bcrypt = require('bcrypt');
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

    User.findOne.mockResolvedValue(mockUser());

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'joao@email.com', password: 'SenhaErrada1' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Credenciais inválidas.');
  });

  it('retorna 401 com mensagem genérica para e-mail inexistente', async () => {
    User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'naoexiste@email.com', password: 'Qualquer1' });

    expect(res.status).toBe(401);
    // Mesma mensagem do caso de senha errada — não vaza existência do e-mail
    expect(res.body.error).toBe('Credenciais inválidas.');
  });

  it('retorna 200 com token JWT válido e csrfToken no login correto', async () => {
    const bcrypt = require('bcrypt');
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

    User.findOne.mockResolvedValue(mockUser());

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'joao@email.com', password: 'Senha123!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('csrfToken');
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user).not.toHaveProperty('password_hash');

    // Valida que o token é um JWT real com 3 partes
    const parts = res.body.token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('retorna 422 se o e-mail estiver ausente', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'Senha123!' });
    expect(res.status).toBe(422);
  });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('retorna 401 sem token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('retorna 401 com token malformado', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer token.invalido.aqui');
    expect(res.status).toBe(401);
  });

  it('retorna 200 com dados do usuário para token válido', async () => {
    const user = mockUser();
    User.findOne.mockResolvedValue(user);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${validToken(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty('email', 'joao@email.com');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('retorna 401 se o usuário não existir mais no banco', async () => {
    User.findOne.mockResolvedValue(null); // usuário deletado

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(401);
  });
});

// ── GET /api/health ───────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('retorna status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });
});

// ── EMAIL_VERIFICATION=off (implantação de demonstração, sem SMTP) ────────────

describe('cadastro com verificação de e-mail desligada', () => {
  const { sendVerificationEmail } = require('../services/emailService');
  const body = { name: 'Maria Silva', email: 'maria@email.com', password: 'Senha123!', age: 22 };

  beforeEach(() => { process.env.EMAIL_VERIFICATION = 'off'; });
  afterEach(() => { delete process.env.EMAIL_VERIFICATION; });

  it('cria a conta já verificada e devolve token, sem enviar e-mail', async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue(mockUser({ id: 42, email: 'maria@email.com' }));

    const res = await request(app).post('/api/auth/register').send(body);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('csrfToken');
    expect(res.body.user).not.toHaveProperty('password_hash');
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ email_verified: true }));
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('e-mail já cadastrado continua retornando 409', async () => {
    User.findOne.mockResolvedValue(mockUser({ email_verified: false }));
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(409);
  });

  it('com verificação ligada, o cadastro não devolve token', async () => {
    delete process.env.EMAIL_VERIFICATION;
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue(mockUser({ id: 43, email_verified: false }));
    VerificationCode.create.mockResolvedValue({});

    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('token');
    expect(sendVerificationEmail).toHaveBeenCalled();
  });
});
