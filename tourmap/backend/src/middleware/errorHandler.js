const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const SEQUELIZE_ERRORS = {
  SequelizeValidationError:           { status: 422, message: 'Dados inválidos.' },
  SequelizeUniqueConstraintError:     { status: 409, message: 'Registro duplicado.' },
  SequelizeForeignKeyConstraintError: { status: 422, message: 'Referência inválida.' },
  SequelizeDatabaseError:             { status: 500, message: 'Erro no banco de dados.' },
  SequelizeConnectionError:           { status: 503, message: 'Serviço temporariamente indisponível.' },
  SequelizeConnectionRefusedError:    { status: 503, message: 'Serviço temporariamente indisponível.' },
  SequelizeTimeoutError:              { status: 503, message: 'Tempo de resposta excedido.' },
};

function friendlyMessage(err) {
  if (err.isJoi) {
    const details = err.details?.map((d) => d.message) || [];
    return { status: 400, message: 'Dados inválidos.', details };
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
    return { status: 401, message: 'Não autorizado.' };
  }
  if (err.name === 'TokenExpiredError') {
    return { status: 401, message: 'Sessão expirada. Faça login novamente.' };
  }

  const sqErr = SEQUELIZE_ERRORS[err.name];
  if (sqErr) {
    const details = !isProd && err.errors?.map((e) => e.message);
    return { status: sqErr.status, message: sqErr.message, ...(details?.length ? { details } : {}) };
  }

  if (err.status === 403) return { status: 403, message: err.message || 'Acesso negado.' };

  if (err.status && err.status < 500) {
    return { status: err.status, message: err.message || 'Requisição inválida.' };
  }

  return { status: 500, message: 'Erro interno do servidor.' };
}

function logError(err, req, status) {
  if (isTest) return;

  const entry = {
    ts:     new Date().toISOString(),
    method: req.method,
    path:   req.path,
    status,
    userId: req.user?.id ?? null,
    ip:     req.ip,
    error:  err.message,
  };

  if (status >= 500) {
    console.error('[ERROR]', JSON.stringify(entry));
    if (!isProd) console.error(err.stack);
  } else {
    console.warn('[WARN]', JSON.stringify(entry));
  }
}

function errorHandler(err, req, res, _next) {
  const { status, message, details } = friendlyMessage(err);

  logError(err, req, status);

  const body = { error: message };
  if (details)             body.details = details;
  if (!isProd && status >= 500 && err.stack) body.stack = err.stack;

  res.status(status).json(body);
}

module.exports = errorHandler;
