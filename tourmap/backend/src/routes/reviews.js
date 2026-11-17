const router = require('express').Router({ mergeParams: true }); // mergeParams exposes :placeId from parent
const { numericParams, numericParam } = require('../middleware/numericParams');
router.use(numericParams('placeId'));
router.param('reviewId', numericParam);
const Joi = require('joi');
const { Op, fn, col } = require('sequelize');
const { authenticate } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { reviewsCreateLimit } = require('../middleware/rateLimit');
const { Place, Review, User } = require('../models/index');
const { stripTags } = require('../utils/sanitize');
const { analyzeSentiment } = require('../services/aiService');
const { checkAndUpdateAlerts } = require('../services/alertService');
const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('../config/constants');

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

const reviewBodySchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required().messages({
    'number.min': 'A nota deve ser entre 1 e 5.',
    'number.max': 'A nota deve ser entre 1 e 5.',
    'any.required': 'A nota é obrigatória.',
  }),
  comment: Joi.string().trim().min(10).max(1000).required().messages({
    'string.min': 'O comentário deve ter pelo menos 10 caracteres.',
    'string.max': 'O comentário deve ter no máximo 1000 caracteres.',
    'any.required': 'O comentário é obrigatório.',
  }),
});

// ── GET /api/places/:placeId/reviews ─────────────────────────────────────────

router.get('/', validateQuery(listQuerySchema), async (req, res, next) => {
  try {
    const placeId = parseInt(req.params.placeId, 10);
    const { page, limit } = req.query;

    const place = await Place.findByPk(placeId, { attributes: ['id'] });
    if (!place) return res.status(404).json({ error: 'Lugar não encontrado.' });

    const { count, rows } = await Review.findAndCountAll({
      where: { place_id: placeId },
      include: [{ model: User, as: 'author', attributes: ['id', 'name', 'avatar_url'] }],
      order: [['created_at', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });

    res.json({ total: count, page, limit, items: rows });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/places/:placeId/reviews ────────────────────────────────────────

router.post('/', authenticate, reviewsCreateLimit, validate(reviewBodySchema), async (req, res, next) => {
  try {
    const placeId = parseInt(req.params.placeId, 10);
    const userId = req.user.id;

    const place = await Place.findByPk(placeId);
    if (!place) return res.status(404).json({ error: 'Lugar não encontrado.' });

    const existing = await Review.findOne({ where: { user_id: userId, place_id: placeId } });
    if (existing) {
      return res.status(409).json({ error: 'Você já avaliou este lugar.' });
    }

    const comment = stripTags(req.body.comment);
    const review = await Review.create({
      user_id: userId,
      place_id: placeId,
      rating: req.body.rating,
      comment,
    });

    const stats = await Review.findOne({
      where: { place_id: placeId },
      attributes: [
        [fn('AVG', col('rating')), 'avg'],
        [fn('COUNT', col('id')), 'total'],
      ],
      raw: true,
    });
    await place.update({
      avg_rating: Math.round(parseFloat(stats.avg) * 10) / 10,
      review_count: parseInt(stats.total, 10),
    });

    // Captura io e placeName antes do setImmediate para não perder o req
    // userId já está declarado no início do try — disponível via closure
    const io        = req.app.get('io');
    const placeName = place.name;

    // Responde imediatamente — o cliente que postou não espera sentimento
    res.status(201).json({ review: review.toJSON() });

    // Pós-resposta: analisa sentimento, persiste e SÓ ENTÃO emite review:new
    // com o sentiment já preenchido para os outros usuários na sala
    setImmediate(async () => {
      let sentiment = null;
      const result = await analyzeSentiment(comment);
      if (result) {
        sentiment = result.sentiment;
        await review.update({ sentiment: result.sentiment, sentiment_score: result.score });
      }
      await checkAndUpdateAlerts(placeId, io);

      if (io) {
        // Busca avatar atualizado do banco — JWT pode estar desatualizado
        const freshUser = await User.findByPk(userId, { attributes: ['id', 'name', 'avatar_url'] });
        const author = freshUser
          ? { id: freshUser.id, name: freshUser.name, avatar_url: freshUser.avatar_url }
          : { id: userId, name: req.user.name, avatar_url: req.user.avatar_url };

        io.to(`place:${placeId}`).emit('review:new', {
          placeId,
          placeName,
          review: {
            id:              review.id,
            rating:          review.rating,
            comment:         review.comment,
            sentiment,
            sentiment_score: result?.score ?? null,
            created_at:      review.created_at,
            author,
          },
        });
      }
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Você já avaliou este lugar.' });
    }
    next(err);
  }
});

// ── PUT /api/places/:placeId/reviews/:reviewId ────────────────────────────────

router.put('/:reviewId', authenticate, validate(reviewBodySchema), async (req, res, next) => {
  try {
    const placeId  = parseInt(req.params.placeId,  10);
    const reviewId = parseInt(req.params.reviewId, 10);
    const userId   = req.user.id;

    const review = await Review.findOne({ where: { id: reviewId, place_id: placeId } });
    if (!review) return res.status(404).json({ error: 'Avaliação não encontrada.' });
    if (review.user_id !== userId) return res.status(403).json({ error: 'Sem permissão.' });

    const comment = stripTags(req.body.comment);
    await review.update({ rating: req.body.rating, comment, sentiment: null, sentiment_score: null });

    const stats = await Review.findOne({
      where: { place_id: placeId },
      attributes: [
        [fn('AVG', col('rating')), 'avg'],
        [fn('COUNT', col('id')), 'total'],
      ],
      raw: true,
    });
    await Place.update(
      {
        avg_rating:   stats.avg ? Math.round(parseFloat(stats.avg) * 10) / 10 : 0,
        review_count: parseInt(stats.total, 10) || 0,
      },
      { where: { id: placeId } }
    );

    res.json({ review: review.toJSON() });

    setImmediate(async () => {
      const result = await analyzeSentiment(comment);
      if (result) {
        await review.update({ sentiment: result.sentiment, sentiment_score: result.score });
        const io = req.app.get('io');
        if (io) {
          io.to(`place:${placeId}`).emit('review:updated', {
            placeId,
            review: {
              id:              review.id,
              rating:          req.body.rating,
              comment,
              sentiment:       result.sentiment,
              sentiment_score: result.score,
            },
          });
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/places/:placeId/reviews/:reviewId ─────────────────────────────

router.delete('/:reviewId', authenticate, async (req, res, next) => {
  try {
    const placeId  = parseInt(req.params.placeId,  10);
    const reviewId = parseInt(req.params.reviewId, 10);
    const userId   = req.user.id;

    const review = await Review.findOne({ where: { id: reviewId, place_id: placeId } });
    if (!review) return res.status(404).json({ error: 'Avaliação não encontrada.' });
    if (review.user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão.' });
    }

    await review.destroy();

    const stats = await Review.findOne({
      where: { place_id: placeId },
      attributes: [
        [fn('AVG', col('rating')), 'avg'],
        [fn('COUNT', col('id')), 'total'],
      ],
      raw: true,
    });
    await Place.update(
      {
        avg_rating:   stats.avg ? Math.round(parseFloat(stats.avg) * 10) / 10 : 0,
        review_count: parseInt(stats.total, 10) || 0,
      },
      { where: { id: placeId } }
    );

    const io = req.app.get('io');
    if (io) io.to(`place:${placeId}`).emit('review:deleted', { placeId, reviewId });

    await checkAndUpdateAlerts(placeId, io);

    res.json({ message: 'Avaliação excluída.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
