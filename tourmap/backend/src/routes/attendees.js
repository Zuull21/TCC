const router = require('express').Router({ mergeParams: true });
const { numericParams } = require('../middleware/numericParams');
router.use(numericParams('placeId'));
const Joi = require('joi');
const { fn, col } = require('sequelize');
const { authenticate } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { Place, User, EventAttendee } = require('../models/index');
const { DEFAULT_PAGE_SIZE } = require('../config/constants');

const attendBodySchema = Joi.object({
  status: Joi.string().valid('going', 'maybe').default('going'),
});

const listQuerySchema = Joi.object({
  page:  Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(DEFAULT_PAGE_SIZE),
});

// ── GET /api/places/:placeId/attendees ────────────────────────────────────────

router.get('/', validateQuery(listQuerySchema), async (req, res, next) => {
  try {
    const placeId = parseInt(req.params.placeId, 10);
    const { page, limit } = req.query;

    const place = await Place.findByPk(placeId, { attributes: ['id', 'type'] });
    if (!place) return res.status(404).json({ error: 'Evento não encontrado.' });

    const { count, rows } = await EventAttendee.findAndCountAll({
      where: { event_id: placeId },
      include: [{ model: User, as: 'attendee', attributes: ['id', 'name', 'avatar_url', 'city'] }],
      order: [['created_at', 'ASC']],
      limit,
      offset: (page - 1) * limit,
    });

    const going = await EventAttendee.count({ where: { event_id: placeId, status: 'going' } });
    const maybe = await EventAttendee.count({ where: { event_id: placeId, status: 'maybe' } });

    res.json({ total: count, going, maybe, page, limit, items: rows });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/places/:placeId/attend ─────────────────────────────────────────

router.post('/', authenticate, validate(attendBodySchema), async (req, res, next) => {
  try {
    const placeId = parseInt(req.params.placeId, 10);
    const userId  = req.user.id;

    const place = await Place.findByPk(placeId, { attributes: ['id', 'type', 'max_attendees', 'attendee_count', 'created_by', 'event_date'] });
    if (!place) return res.status(404).json({ error: 'Evento não encontrado.' });
    if (place.type !== 'event') return res.status(400).json({ error: 'Apenas eventos aceitam confirmação de presença.' });
    if (place.created_by === userId) return res.status(400).json({ error: 'O organizador não pode confirmar presença no próprio evento.' });

    if (place.event_date) {
      // Compara usando horário de Brasília (UTC-3)
      const todayBrasilia = new Date()
        .toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
        .split('/').reverse().join('-'); // YYYY-MM-DD
      const eventStr = place.event_date instanceof Date
        ? place.event_date.toISOString().split('T')[0]
        : String(place.event_date).split('T')[0];
      if (eventStr < todayBrasilia) {
        return res.status(410).json({ error: 'Este evento já foi encerrado.' });
      }
    }

    const { status } = req.body;

    if (place.max_attendees && place.attendee_count >= place.max_attendees && status === 'going') {
      return res.status(409).json({ error: 'Este evento atingiu o limite de participantes.' });
    }

    const [attendance, created] = await EventAttendee.findOrCreate({
      where: { event_id: placeId, user_id: userId },
      defaults: { status },
    });

    if (!created) {
      await attendance.update({ status });
    }

    const newCount = await EventAttendee.count({ where: { event_id: placeId, status: 'going' } });
    await place.update({ attendee_count: newCount });

    res.status(created ? 201 : 200).json({ attendance: attendance.toJSON(), attendee_count: newCount });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/places/:placeId/attend ────────────────────────────────────────

router.delete('/', authenticate, async (req, res, next) => {
  try {
    const placeId = parseInt(req.params.placeId, 10);
    const userId  = req.user.id;

    const deleted = await EventAttendee.destroy({ where: { event_id: placeId, user_id: userId } });
    if (!deleted) return res.status(404).json({ error: 'Você não está inscrito neste evento.' });

    const place = await Place.findByPk(placeId, { attributes: ['id'] });
    if (place) {
      const newCount = await EventAttendee.count({ where: { event_id: placeId, status: 'going' } });
      await place.update({ attendee_count: newCount });
    }

    res.json({ message: 'Presença cancelada com sucesso.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
