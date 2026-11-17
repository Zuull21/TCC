const router = require('express').Router();
const Joi = require('joi');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { authRateLimit, resendRateLimit } = require('../middleware/rateLimit');
const authService = require('../services/authService');

const registerSchema = Joi.object({
  name: Joi.string().trim().min(3).max(100).required().messages({
    'string.min': 'O nome deve ter pelo menos 3 caracteres.',
    'string.max': 'O nome deve ter no máximo 100 caracteres.',
    'any.required': 'O nome é obrigatório.',
  }),
  email: Joi.string().email().lowercase().trim().required().messages({
    'string.email': 'Informe um e-mail válido.',
    'any.required': 'O e-mail é obrigatório.',
  }),
  password: Joi.string()
    .min(8)
    .pattern(/[A-Z]/)
    .pattern(/[0-9]/)
    .required()
    .messages({
      'string.min': 'A senha deve ter pelo menos 8 caracteres.',
      'string.pattern.base': 'A senha deve conter pelo menos uma letra maiúscula e um número.',
      'any.required': 'A senha é obrigatória.',
    }),
  age: Joi.number().integer().min(18).max(120).required().messages({
    'number.min': 'Você deve ter pelo menos 18 anos para se cadastrar.',
    'any.required': 'A idade é obrigatória.',
  }),
});

const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().required(),
});

const verifyEmailSchema = Joi.object({
  userId: Joi.number().integer().positive().required(),
  code: Joi.string().length(6).pattern(/^\d{6}$/).required().messages({
    'string.length': 'O código deve ter 6 dígitos.',
    'string.pattern.base': 'O código deve conter apenas números.',
  }),
});

const resendCodeSchema = Joi.object({
  userId: Joi.number().integer().positive().required(),
});

router.post('/register', authRateLimit, validate(registerSchema), async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    // Com verificação desligada, o cadastro já devolve token e o usuário entra direto
    res.status(201).json(result.token
      ? { message: 'Conta criada!', ...result }
      : { message: 'Conta criada! Verifique o código enviado para o seu e-mail.', userId: result.userId });
  } catch (err) {
    next(err);
  }
});

router.post('/verify-email', authRateLimit, validate(verifyEmailSchema), async (req, res, next) => {
  try {
    const { userId, code } = req.body;
    const { token, csrfToken, user } = await authService.verifyEmail(userId, code);
    res.json({ token, csrfToken, user });
  } catch (err) {
    next(err);
  }
});

router.post('/resend-code', resendRateLimit, validate(resendCodeSchema), async (req, res, next) => {
  try {
    await authService.resendCode(req.body.userId);
    res.json({ message: 'Se o cadastro existir, um novo código foi enviado.' });
  } catch (err) {
    next(err);
  }
});

router.post('/login', authRateLimit, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { token, csrfToken, user } = await authService.login(email, password);
    res.json({ token, csrfToken, user });
  } catch (err) {
    if (err.needsVerification) {
      return res.status(403).json({
        error: err.message,
        needsVerification: true,
        userId: err.userId,
      });
    }
    next(err);
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
