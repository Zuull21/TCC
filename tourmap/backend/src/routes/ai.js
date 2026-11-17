/**
 * /api/ai — Rotas de IA (demonstração e diagnóstico)
 *
 * Não requer autenticação — é uma rota pública para demo ao vivo.
 * Tem rate limit próprio: cada requisição roda dois modelos.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { compareModels, engineInfo } = require('../services/aiService');

const router = express.Router();

// Rate limit conservador: 20 req/min por IP (cada request roda 2 modelos)
const demoLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Muitas requisições. Aguarde um momento.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/ai/compare
 *
 * Executa M1 (RoBERTa), M2 (DistilBERT sem threshold), M2 (com threshold) e
 * M3 (palavras-chave) sobre o texto recebido e retorna todos os resultados.
 *
 * Body: { text: string }
 *
 * Response:
 * {
 *   m1:        { sentiment, score },   // RoBERTa — inglês
 *   m2_raw:    { sentiment, score },   // DistilBERT — sem threshold
 *   m2:        { sentiment, score },   // DistilBERT — COM threshold (produção)
 *   m3:        { sentiment, score },   // Palavras-chave PT-BR
 *   threshold: 0.65,                   // valor do limiar aplicado
 *   m2_changed: boolean,               // pós-processamento alterou o resultado?
 *   engine:    'local'|'api'|'off',    // motor de inferência
 *   dtype:     'fp32'|'q8'|null,       // precisão do modelo local
 *   latency_ms: number                 // tempo total da comparação
 * }
 */
router.post('/compare', demoLimit, async (req, res, next) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Campo "text" obrigatório.' });
    }

    if (text.trim().length < 5) {
      return res.status(400).json({ error: 'Texto muito curto (mínimo 5 caracteres).' });
    }

    if (text.length > 2000) {
      return res.status(400).json({ error: 'Texto muito longo (máximo 2000 caracteres).' });
    }

    const t0 = Date.now();
    const result = await compareModels(text.trim());

    res.json({ ...result, ...engineInfo(), latency_ms: Date.now() - t0 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
