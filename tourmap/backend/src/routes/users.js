const router = require('express').Router();
router.param('id', require('../middleware/numericParams').numericParam);
const Joi = require('joi');
const { authenticate } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { User, Place, Review, OrganizerReview, EventAttendee } = require('../models/index');
const { stripTags } = require('../utils/sanitize');
const { DEFAULT_PAGE_SIZE } = require('../config/constants');

const listQuerySchema = Joi.object({
  page:  Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(DEFAULT_PAGE_SIZE),
});

const updateUserSchema = Joi.object({
  name:       Joi.string().trim().min(3).max(100),
  bio:        Joi.string().trim().max(500).allow('', null),
  city:       Joi.string().trim().max(100).allow('', null),
  avatar_url: Joi.string().uri().max(500).allow('', null),
});

// ── GET /api/users/me ─────────────────────────────────────────────────────────

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const [user, review_count] = await Promise.all([
      User.findByPk(req.user.id, { attributes: { exclude: ['password_hash'] } }),
      Review.count({ where: { user_id: req.user.id } }),
    ]);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json({ user: { ...user.toJSON(), review_count } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/users/me/places — todos os lugares criados pelo usuário logado ───

router.get('/me/places', authenticate, async (req, res, next) => {
  try {
    const items = await Place.findAll({
      where: { created_by: req.user.id },
      include: [{ model: User, as: 'creator', attributes: ['id', 'name', 'avatar_url'] }],
      order: [['created_at', 'DESC']],
    });
    res.json({ total: items.length, items: items.map((p) => p.toJSON()) });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/users/me/attending — eventos em que o usuário está inscrito ──────

router.get('/me/attending', authenticate, async (req, res, next) => {
  try {
    const attendances = await EventAttendee.findAll({
      where: { user_id: req.user.id },
      include: [{
        model: Place,
        as: 'event',
        include: [{ model: User, as: 'creator', attributes: ['id', 'name', 'avatar_url'] }],
      }],
      order: [['created_at', 'DESC']],
    });

    const items = attendances
      .filter((a) => a.event !== null)
      .map((a) => ({ ...a.event.toJSON(), user_attendance: a.status }));

    res.json({ total: items.length, items });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/users/me ─────────────────────────────────────────────────────────

router.put('/me', authenticate, validate(updateUserSchema), async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, { attributes: { exclude: ['password_hash'] } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const { name, bio, city, avatar_url } = req.body;
    const updates = {};
    if (name       !== undefined) updates.name       = stripTags(name);
    if (bio        !== undefined) updates.bio        = bio  ? stripTags(bio)  : null;
    if (city       !== undefined) updates.city       = city ? stripTags(city) : null;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url || null;

    await user.update(updates);
    res.json({ user: user.toJSON() });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/users/me/reviews — avaliações escritas pelo usuário logado ──────

router.get('/me/reviews', authenticate, async (req, res, next) => {
  try {
    const rows = await Review.findAll({
      where: { user_id: req.user.id },
      include: [{ model: Place, as: 'place', attributes: ['id', 'name', 'image_url', 'type', 'category'] }],
      order: [['created_at', 'DESC']],
      limit: 50,
    });
    res.json({ total: rows.length, items: rows.map((r) => r.toJSON()) });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/users/:id/organizer-reviews ─────────────────────────────────────

router.get('/:id/organizer-reviews', validateQuery(listQuerySchema), async (req, res, next) => {
  try {
    const organizerId = parseInt(req.params.id, 10);
    const { page, limit } = req.query;

    const organizer = await User.findByPk(organizerId, {
      attributes: ['id', 'name', 'avatar_url', 'avg_organizer_rating', 'organizer_review_count'],
    });
    if (!organizer) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const { count, rows } = await OrganizerReview.findAndCountAll({
      where: { organizer_id: organizerId },
      include: [
        { model: User,  as: 'reviewer', attributes: ['id', 'name', 'avatar_url'] },
        { model: Place, as: 'event',    attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });

    res.json({ total: count, page, limit, organizer: organizer.toJSON(), items: rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/users/:id — perfil público ──────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);

    const user = await User.findByPk(userId, {
      attributes: ['id', 'name', 'avatar_url', 'bio', 'city', 'role',
                   'avg_organizer_rating', 'organizer_review_count', 'createdAt'],
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const eventsCreated = await Place.count({ where: { created_by: userId, type: 'event' } });

    res.json({ user: user.toJSON(), events_created: eventsCreated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
