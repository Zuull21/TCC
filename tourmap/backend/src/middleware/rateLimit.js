const rateLimit = require('express-rate-limit');

const isTest    = process.env.NODE_ENV === 'test';
const skipFn    = () => isTest;
const userOrIp  = (req) => String(req.user?.id || req.ip);

function make(opts) {
  return rateLimit({
    standardHeaders: 'draft-7',  // envia RateLimit-Limit/Remaining/Reset
    legacyHeaders: false,
    skip: skipFn,
    ...opts,
  });
}

// ── Limites por IP ────────────────────────────────────────────────────────────

const globalRateLimit = make({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
});

const authRateLimit = make({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' },
});

const resendRateLimit = make({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: 'Limite de reenvio atingido. Aguarde 15 minutos.' },
});

// ── Limites por usuário autenticado ───────────────────────────────────────────

const placesCreateLimit = make({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: userOrIp,
  message: { error: 'Limite de criação de lugares atingido. Tente novamente em 1 hora.' },
});

const reviewsCreateLimit = make({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: userOrIp,
  message: { error: 'Limite de avaliações atingido. Tente novamente em 1 hora.' },
});

const postsCreateLimit = make({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: userOrIp,
  message: { error: 'Limite de posts atingido. Tente novamente em 1 hora.' },
});

module.exports = {
  globalRateLimit,
  authRateLimit,
  resendRateLimit,
  placesCreateLimit,
  reviewsCreateLimit,
  postsCreateLimit,
};
