/**
 * validate.js
 * Factories de middleware para validação com Joi.
 * Rejeita campos não esperados (stripUnknown: true).
 */

const BASE_OPTS = { abortEarly: false, stripUnknown: true };

function toResponse(error) {
  const details = error.details.map((d) => d.message);
  return { status: 422, body: { error: 'Dados inválidos.', details } };
}

/** Valida req.body */
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, BASE_OPTS);
    if (error) {
      const r = toResponse(error);
      return res.status(r.status).json(r.body);
    }
    req.body = value;
    next();
  };
}

/** Valida req.query (com conversão automática de tipos) */
function validateQuery(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, { ...BASE_OPTS, convert: true });
    if (error) {
      const r = toResponse(error);
      return res.status(r.status).json(r.body);
    }
    req.query = value;
    next();
  };
}

module.exports = { validate, validateQuery };
