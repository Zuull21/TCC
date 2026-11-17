/**
 * Recusa com 400 qualquer parâmetro de rota que deveria ser um ID numérico.
 * Sem isso, "/places/abc/reviews" chega ao banco e vira erro 500.
 *
 * Uso: router.use(numericParams('placeId')) em routers com mergeParams,
 *      e router.param('id', numericParam) para parâmetros do próprio router.
 */
function isId(v) {
  return /^\d+$/.test(String(v));
}

function numericParams(...names) {
  return (req, res, next) => {
    for (const n of names) {
      if (req.params[n] !== undefined && !isId(req.params[n])) {
        return res.status(400).json({ error: 'ID inválido.' });
      }
    }
    next();
  };
}

function numericParam(req, res, next, value) {
  if (!isId(value)) return res.status(400).json({ error: 'ID inválido.' });
  next();
}

module.exports = { numericParams, numericParam };
