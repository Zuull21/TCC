// Double-submit CSRF via HMAC-SHA256(jwtToken, JWT_SECRET).
// Stateless: csrfToken is generated on login, sent as X-CSRF-Token on mutations,
// and validated by recomputing the HMAC from the current Bearer token.
const crypto = require('crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function generateCsrfToken(jwtToken) {
  return crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(jwtToken)
    .digest('hex');
}

function validateCsrfToken(jwtToken, csrfHeader) {
  if (!jwtToken || !csrfHeader) return false;
  try {
    const expected = Buffer.from(generateCsrfToken(jwtToken), 'hex');
    const received = Buffer.from(csrfHeader, 'hex');
    if (expected.length !== received.length) return false;
    return crypto.timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

function csrfProtection(req, res, next) {
  if (process.env.NODE_ENV === 'test') return next();
  if (SAFE_METHODS.has(req.method))   return next();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next(); // unauthenticated — auth middleware rejeita

  const jwtToken  = authHeader.split(' ')[1];
  const csrfToken = req.headers['x-csrf-token'];

  if (!validateCsrfToken(jwtToken, csrfToken)) {
    return res.status(403).json({ error: 'Token CSRF ausente ou inválido.' });
  }

  next();
}

module.exports = { csrfProtection, generateCsrfToken };
