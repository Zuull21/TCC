const router = require('express').Router();
router.param('id', require('../middleware/numericParams').numericParam);
const Joi = require('joi');
const { authenticate } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { postsCreateLimit } = require('../middleware/rateLimit');
const { Post, User, Place, PostLike } = require('../models/index');
const { sequelize } = require('../config/db');
const { stripTags } = require('../utils/sanitize');
const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('../config/constants');

// ── Schemas ───────────────────────────────────────────────────────────────────

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  place_id: Joi.number().integer().positive(),
});

const postBodySchema = Joi.object({
  title: Joi.string().trim().min(5).max(200).required().messages({
    'string.min': 'O título deve ter pelo menos 5 caracteres.',
    'any.required': 'O título é obrigatório.',
  }),
  content: Joi.string().trim().min(10).max(5000).required().messages({
    'string.min': 'O conteúdo deve ter pelo menos 10 caracteres.',
    'any.required': 'O conteúdo é obrigatório.',
  }),
  place_id: Joi.number().integer().positive().allow(null),
  image_url: Joi.string().uri().max(500).allow('', null),
});

// ── GET /api/posts ────────────────────────────────────────────────────────────

router.get('/', validateQuery(listQuerySchema), async (req, res, next) => {
  try {
    const { page, limit, place_id } = req.query;

    const where = {};
    if (place_id) where.place_id = place_id;

    const { count, rows } = await Post.findAndCountAll({
      where,
      include: [
        { model: User, as: 'author', attributes: ['id', 'name', 'avatar_url'] },
        {
          model: Place,
          as: 'place',
          required: false,
          attributes: ['id', 'name', 'city', 'category'],
        },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });

    res.json({ total: count, page, limit, items: rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/posts/:id ────────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const post = await Post.findByPk(req.params.id, {
      include: [
        { model: User, as: 'author', attributes: ['id', 'name', 'avatar_url', 'bio'] },
        {
          model: Place,
          as: 'place',
          required: false,
          attributes: ['id', 'name', 'city', 'state', 'category', 'image_url'],
        },
      ],
    });

    if (!post) return res.status(404).json({ error: 'Post não encontrado.' });
    res.json({ post: post.toJSON() });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/posts ───────────────────────────────────────────────────────────

router.post('/', authenticate, postsCreateLimit, validate(postBodySchema), async (req, res, next) => {
  try {
    const { title, content, place_id, image_url } = req.body;

    // Valida existência do lugar referenciado
    if (place_id) {
      const place = await Place.findByPk(place_id, { attributes: ['id'] });
      if (!place) return res.status(422).json({ error: 'Lugar não encontrado.' });
    }

    const post = await Post.create({
      user_id: req.user.id,
      title: stripTags(title),
      content: stripTags(content),
      place_id: place_id || null,
      image_url: image_url || null,
    });

    res.status(201).json({ post: post.toJSON() });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/posts/:id ─────────────────────────────────────────────────────

router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const post = await Post.findByPk(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post não encontrado.' });

    if (post.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão para remover este post.' });
    }

    await post.destroy();
    res.json({ message: 'Post removido com sucesso.' });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/posts/:id/like (autenticado) ────────────────────────────────────

// Liga/desliga: cada usuário conta no máximo uma curtida por post.
router.post('/:id/like', authenticate, async (req, res, next) => {
  try {
    const post = await Post.findByPk(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post não encontrado.' });

    const liked = await sequelize.transaction(async (transaction) => {
      const [, created] = await PostLike.findOrCreate({
        where: { post_id: post.id, user_id: req.user.id },
        transaction,
      });
      if (created) {
        await post.increment('likes_count', { by: 1, transaction });
        return true;
      }
      await PostLike.destroy({ where: { post_id: post.id, user_id: req.user.id }, transaction });
      if (post.likes_count > 0) await post.decrement('likes_count', { by: 1, transaction });
      return false;
    });

    await post.reload({ attributes: ['likes_count'] });
    res.json({ likes_count: post.likes_count, liked });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
