const jwt = require('jsonwebtoken');
const { User } = require('../models/index');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }

  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findOne({
      where: process.env.EMAIL_VERIFICATION === 'off'
        ? { id: payload.id }
        : { id: payload.id, email_verified: true },
      attributes: ['id', 'name', 'email', 'role', 'avatar_url'],
    });

    if (!user) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }

    // Copia só os campos públicos: nunca expõe password_hash, mesmo que o model mude
    const { id, name, email, role, avatar_url } = user.toJSON();
    req.user = { id, name, email, role, avatar_url };
    next();
  } catch {
    return res.status(401).json({ error: 'Não autorizado.' });
  }
}

// Must be used after `authenticate`.
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
