const router = require('express').Router();
router.param('id', require('../middleware/numericParams').numericParam);
const Joi = require('joi');
const { Op } = require('sequelize');
const { authenticate, authorize } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { Alert, Place } = require('../models/index');
const { USER_ROLES, ALERT_LEVEL_VALUES } = require('../config/constants');

const listQuerySchema = Joi.object({
  place_id:  Joi.number().integer().positive(),
  level:     Joi.string().valid(...ALERT_LEVEL_VALUES),
  is_active: Joi.boolean().default(true),
  page:      Joi.number().integer().min(1).default(1),
  limit:     Joi.number().integer().min(1).max(50).default(20),
});

const createAlertSchema = Joi.object({
  place_id:     Joi.number().integer().positive().required(),
  level:        Joi.string().valid(...ALERT_LEVEL_VALUES).required(),
  message:      Joi.string().trim().min(10).max(1000).required(),
  trigger_type: Joi.string().trim().max(80).allow('', null),
});

// ── GET /api/alerts ───────────────────────────────────────────────────────────
router.get('/', validateQuery(listQuerySchema), async (req, res, next) => {
  try {
    const { place_id, level, is_active, page, limit } = req.query;
    const where = {};
    if (place_id !== undefined) where.place_id = place_id;
    if (level)                  where.level     = level;
    if (is_active !== undefined) where.is_active = is_active;

    const { count, rows } = await Alert.findAndCountAll({
      where,
      include: [{ model: Place, as: 'place', attributes: ['id', 'name', 'city', 'state', 'category'] }],
      order: [['created_at', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });

    res.json({ total: count, page, limit, items: rows });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/alerts (admin, ou o guia que criou o lugar) ────────────────────
router.post(
  '/',
  authenticate,
  authorize(USER_ROLES.GUIDE, USER_ROLES.ADMIN),
  validate(createAlertSchema),
  async (req, res, next) => {
    try {
      const { place_id, level, message, trigger_type } = req.body;

      const place = await Place.findByPk(place_id);
      if (!place) return res.status(404).json({ error: 'Lugar não encontrado.' });
      if (req.user.role !== USER_ROLES.ADMIN && place.created_by !== req.user.id) {
        return res.status(403).json({ error: 'Você só pode emitir alertas para lugares que criou.' });
      }

      // Desativa alertas anteriores ativos do mesmo lugar
      await Alert.update(
        { is_active: false, resolved_at: new Date() },
        { where: { place_id, is_active: true } }
      );

      const alert = await Alert.create({ place_id, level, message, trigger_type: trigger_type || null, is_active: true });

      // Atualiza alert_level no lugar
      await place.update({ alert_level: level });

      // Broadcast Socket.IO
      const io = req.app.get('io');
      if (io) {
        io.to(`place:${place_id}`).emit('alert:updated', {
          placeId: place_id,
          level,
          message,
          alert: alert.toJSON(),
        });
      }

      res.status(201).json({ alert: alert.toJSON() });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /api/alerts/:id (admin) ────────────────────────────────────────────
router.delete(
  '/:id',
  authenticate,
  authorize(USER_ROLES.ADMIN),
  async (req, res, next) => {
    try {
      const alert = await Alert.findByPk(req.params.id);
      if (!alert) return res.status(404).json({ error: 'Alerta não encontrado.' });

      await alert.update({ is_active: false, resolved_at: new Date() });

      // Reset alert_level do lugar se não há mais alertas ativos
      const activeCount = await Alert.count({ where: { place_id: alert.place_id, is_active: true } });
      if (activeCount === 0) {
        await Place.update({ alert_level: 'none' }, { where: { id: alert.place_id } });
      }

      res.json({ message: 'Alerta desativado.' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
