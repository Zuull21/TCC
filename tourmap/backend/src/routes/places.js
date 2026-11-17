const router = require('express').Router();

// IDs são inteiros positivos. Sem isso, "1 OR 1=1" chega ao MySQL, que o converte para 1.
router.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'ID inválido.' });
  next();
});

const Joi = require('joi');
const { Op, fn, col, literal } = require('sequelize');
const { authenticate } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { placesCreateLimit } = require('../middleware/rateLimit');
const { Place, Review, Post, Alert, User, EventAttendee, OrganizerReview } = require('../models/index');
const { stripTags } = require('../utils/sanitize');
const { haversineDistance, boundingBox, reverseGeocode } = require('../utils/geocoding');
const { isInBlockedZone } = require('../utils/blockedZones');
const { suggestDestinations } = require('../services/recommendationService');
const { PLACE_CATEGORIES, PLACE_TYPES, DEFAULT_PAGE_SIZE } = require('../config/constants');

const MAX_PAGE_SIZE = 50; // segurança: nunca retornar mais de 50 por request

// ── Cache in-memory para GET /api/places (TTL: 30s) ──────────────────────────
const _cache = new Map();
const CACHE_TTL = 30_000;

function getCached(key) {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL) { _cache.delete(key); return null; }
  return e.data;
}
function setCache(key, data) {
  _cache.set(key, { ts: Date.now(), data });
  if (_cache.size > 200) { _cache.delete(_cache.keys().next().value); }
}
function clearCache() { _cache.clear(); }

const BRAZIL_STATES = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
  'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
  'RS','RO','RR','SC','SP','SE','TO',
];

const listQuerySchema = Joi.object({
  category:   Joi.string().valid(...PLACE_CATEGORIES),
  type:       Joi.string().valid(...PLACE_TYPES, 'all'),
  state:      Joi.string().valid(...BRAZIL_STATES).uppercase(),
  is_free:    Joi.boolean(),
  min_rating: Joi.number().min(0).max(5),
  lat:        Joi.number().min(-90).max(90),
  lng:        Joi.number().min(-180).max(180),
  radius:     Joi.number().min(1).max(500).default(50),
  search:     Joi.string().trim().max(100),
  page:       Joi.number().integer().min(1).default(1),
  limit:      Joi.number().integer().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
}).and('lat', 'lng');

const placeBodySchema = Joi.object({
  name: Joi.string().trim().min(3).max(150).required(),
  description: Joi.string().trim().min(10).max(2000).allow('', null),
  address: Joi.string().trim().max(300).allow('', null),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  category: Joi.string().valid(...PLACE_CATEGORIES).required(),
  is_free: Joi.boolean().default(true),
  image_url: Joi.string().uri().max(500).allow('', null),
  city: Joi.string().trim().max(100).allow('', null),
  state: Joi.string().trim().length(2).uppercase().allow('', null),
  event_date: Joi.date().iso().allow(null),
  event_start_time: Joi.string().pattern(/^\d{2}:\d{2}$/).allow('', null),
  event_end_time: Joi.string().pattern(/^\d{2}:\d{2}$/).allow('', null),
  max_attendees: Joi.number().integer().min(1).max(100000).allow(null),
  force_event: Joi.boolean().default(false),
});

const organizerReviewSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().trim().min(10).max(1000).allow('', null),
});

const ACTIVE_ALERTS_INCLUDE = {
  model: Alert,
  as: 'alerts',
  where: { is_active: true },
  required: false,
  attributes: ['id', 'level', 'message', 'trigger_type', 'created_at'],
};

const AUTHOR_INCLUDE = {
  model: User,
  as: 'creator',
  attributes: ['id', 'name', 'avatar_url'],
};

function sanitizePlace(body) {
  return {
    ...body,
    name: stripTags(body.name),
    description: body.description ? stripTags(body.description) : null,
    address: body.address ? stripTags(body.address) : null,
    city: body.city ? stripTags(body.city) : null,
    event_date: body.event_date || null,
    event_start_time: body.event_start_time || null,
    event_end_time: body.event_end_time || null,
    max_attendees: body.max_attendees || null,
  };
}

// ── GET /api/places/ranked ────────────────────────────────────────────────────
// Retorna lugares ordenados por sentimento positivo (positive_pct).
// Usado pelo ranking da sidebar.
router.get('/ranked', async (req, res, next) => {
  try {
    const { city, type, state, limit: rawLimit = 20 } = req.query;
    const limit = Math.min(parseInt(rawLimit, 10) || 20, 100);

    const where = {};
    if (type && type !== 'all') where.type = type;
    if (state)  where.state = state.toUpperCase();
    if (city) {
      where.city = { [Op.like]: `%${city}%` };
    }

    const places = await Place.findAll({
      where,
      include: [AUTHOR_INCLUDE],
      attributes: {
        include: [
          [
            literal(`(
              SELECT ROUND(100.0 * SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END)
                         / NULLIF(COUNT(*), 0))
              FROM reviews
              WHERE reviews.place_id = Place.id
                AND reviews.sentiment IS NOT NULL
            )`),
            'positive_pct',
          ],
          [
            literal(`(
              SELECT COUNT(*)
              FROM reviews
              WHERE reviews.place_id = Place.id
                AND reviews.sentiment IS NOT NULL
            )`),
            'analyzed_reviews',
          ],
        ],
      },
      order: [
        [literal('positive_pct'), 'DESC'],
        ['review_count', 'DESC'],
      ],
      limit,
    });

    const items = places.map((p) => ({
      ...p.toJSON(),
      positive_pct:      parseInt(p.getDataValue('positive_pct') || 0, 10),
      analyzed_reviews:  parseInt(p.getDataValue('analyzed_reviews') || 0, 10),
    }));

    res.json({ total: items.length, items });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/places ───────────────────────────────────────────────────────────

// ── GET /api/places/recommended ───────────────────────────────────────────────
// Login opcional: com token, personaliza pelo histórico; sem token, mais bem avaliados.
// Fica antes de /:id para "recommended" não ser lido como ID.

router.get('/recommended', async (req, res, next) => {
  try {
    let userId = null;
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
      try {
        userId = require('jsonwebtoken').verify(header.slice(7), process.env.JWT_SECRET)?.id || null;
      } catch { /* token inválido: trata como visitante */ }
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 6, 20);
    res.json(await suggestDestinations(userId, { limit }));
  } catch (err) {
    next(err);
  }
});

router.get('/', validateQuery(listQuerySchema), async (req, res, next) => {
  try {
    const cacheKey = JSON.stringify(Object.fromEntries(Object.keys(req.query).sort().map((k) => [k, req.query[k]])));
    const cached   = getCached(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    const { category, type, state, is_free, min_rating, lat, lng, radius, search, page, limit } = req.query;

    const where = {};
    if (category) where.category = category;
    if (state)    where.state    = state.toUpperCase();
    // Por padrão mostra pontos turísticos; type=all retorna ambos
    if (type === 'all') { /* sem filtro */ }
    else if (type) where.type = type;
    else where.type = 'tourist';
    if (is_free !== undefined) where.is_free = is_free;
    if (min_rating !== undefined) where.avg_rating = { [Op.gte]: min_rating };

    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
      ];
    }

    // Pré-filtro geográfico via bounding box (usa índice lat/lng)
    let geoFilter = null;
    if (lat !== undefined && lng !== undefined) {
      const box = boundingBox(lat, lng, radius);
      where.latitude = { [Op.between]: [box.minLat, box.maxLat] };
      where.longitude = { [Op.between]: [box.minLon, box.maxLon] };
      geoFilter = { lat, lng, radius };
    }

    let places = await Place.findAll({
      where,
      include: [ACTIVE_ALERTS_INCLUDE, AUTHOR_INCLUDE],
      order: [['avg_rating', 'DESC'], ['review_count', 'DESC']],
    });

    // Filtro Haversine exato + ordenação por distância
    if (geoFilter) {
      places = places
        .map((p) => {
          const dist = haversineDistance(
            geoFilter.lat, geoFilter.lng,
            parseFloat(p.latitude), parseFloat(p.longitude)
          );
          return { ...p.toJSON(), distance_km: Math.round(dist * 10) / 10 };
        })
        .filter((p) => p.distance_km <= geoFilter.radius)
        .sort((a, b) => a.distance_km - b.distance_km);
    } else {
      places = places.map((p) => p.toJSON());
    }

    // Paginação em JS (necessário após filtro Haversine)
    const total = places.length;
    const offset = (page - 1) * limit;
    const items = places.slice(offset, offset + limit);

    const result = { total, page, limit, items };
    setCache(cacheKey, result);
    res.setHeader('X-Cache', 'MISS');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/places/:id ───────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Tenta extrair usuário autenticado (opcional — não bloqueia se não houver token)
    let requestUserId = null;
    try {
      const authHeader = req.headers.authorization || '';
      if (authHeader.startsWith('Bearer ')) {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
        requestUserId = decoded?.id || null;
      }
    } catch { /* não autenticado — ok */ }

    const place = await Place.findByPk(id, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'avatar_url', 'bio', 'city', 'avg_organizer_rating', 'organizer_review_count'],
        },
        ACTIVE_ALERTS_INCLUDE,
        {
          model: Review,
          as: 'reviews',
          limit: 10,
          order: [['created_at', 'DESC']],
          include: [{ model: User, as: 'author', attributes: ['id', 'name', 'avatar_url'] }],
          attributes: ['id', 'rating', 'comment', 'sentiment', 'sentiment_score', 'created_at'],
        },
        {
          model: Post,
          as: 'posts',
          limit: 5,
          order: [['created_at', 'DESC']],
          where: {},
          required: false,
          include: [{ model: User, as: 'author', attributes: ['id', 'name', 'avatar_url'] }],
          attributes: ['id', 'title', 'image_url', 'likes_count', 'created_at'],
        },
      ],
    });

    if (!place) {
      return res.status(404).json({ error: 'Lugar não encontrado.' });
    }

    const [sentimentAgg, ratingDist] = await Promise.all([
      Review.findAll({
        where: { place_id: id, sentiment: { [Op.not]: null } },
        attributes: [
          'sentiment',
          [fn('COUNT', col('id')), 'count'],
          [fn('AVG', col('sentiment_score')), 'avg_score'],
        ],
        group: ['sentiment'],
        raw: true,
      }),
      Review.findAll({
        where: { place_id: id },
        attributes: ['rating', [fn('COUNT', col('id')), 'count']],
        group: ['rating'],
        raw: true,
      }),
    ]);

    let user_attendance = null;
    let attendees_preview = [];

    if (place.type === 'event') {
      if (requestUserId) {
        const att = await EventAttendee.findOne({ where: { event_id: id, user_id: requestUserId } });
        user_attendance = att ? att.status : null;
      }

      // Preview dos primeiros 8 participantes (avatares)
      attendees_preview = await EventAttendee.findAll({
        where: { event_id: id, status: 'going' },
        include: [{ model: User, as: 'attendee', attributes: ['id', 'name', 'avatar_url'] }],
        limit: 8,
        order: [['created_at', 'ASC']],
      });
    }

    res.json({
      place: place.toJSON(),
      sentiment_summary: sentimentAgg,
      rating_distribution: ratingDist,
      user_attendance,
      attendees_preview: attendees_preview.map((a) => a.attendee),
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/places ──────────────────────────────────────────────────────────

router.post('/', authenticate, placesCreateLimit, validate(placeBodySchema), async (req, res, next) => {
  try {
    const data = sanitizePlace(req.body);

    const blocked = isInBlockedZone(data.latitude, data.longitude);
    if (blocked) {
      return res.status(422).json({
        error: `Esta área está classificada como zona de alto risco (${blocked.name}, ${blocked.city}/${blocked.state}). Não é possível criar pontos turísticos aqui por razões de segurança.`,
      });
    }

    const geo = await reverseGeocode(data.latitude, data.longitude);
    if (geo && geo.address?.country_code && geo.address.country_code !== 'br') {
      return res.status(422).json({ error: 'As coordenadas devem estar dentro do Brasil.' });
    }

    // Preenche cidade/estado a partir do Nominatim se não informados
    if (geo?.address) {
      if (!data.city) data.city = geo.address.city || geo.address.town || geo.address.village || null;
      if (!data.state) data.state = geo.address.state_code?.toUpperCase().slice(-2) || null;
    }

    const placeType = (req.user.role === 'admin' && !data.force_event) ? 'tourist' : 'event';
    const { force_event, ...placeData } = data;
    const place = await Place.create({ ...placeData, created_by: req.user.id, type: placeType });
    clearCache();
    res.status(201).json({ place: place.toJSON() });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/places/:id ───────────────────────────────────────────────────────

router.put('/:id', authenticate, validate(placeBodySchema), async (req, res, next) => {
  try {
    const place = await Place.findByPk(req.params.id);
    if (!place) return res.status(404).json({ error: 'Lugar não encontrado.' });

    if (place.created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão para editar este lugar.' });
    }

    const rawData = sanitizePlace(req.body);
    const { force_event, ...data } = rawData;
    await place.update(data);
    clearCache();
    res.json({ place: place.toJSON() });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/places/:id/insights ─────────────────────────────────────────────

const STOPWORDS_PT = new Set([
  'de','a','o','que','e','do','da','em','um','para','com','uma','os','no','se',
  'na','por','mais','as','dos','como','mas','ao','ele','das','seu','sua','ou',
  'ser','quando','muito','já','também','foi','está','eu','não','é','isso','tem',
  'era','bem','aqui','tudo','ainda','assim','então','esse','essa','este','esta',
  'pois','até','ela','nos','são','seus','suas','uns','umas','meu','minha','só',
  'há','lá','pra','vai','nem','nao','voce','vc','foi','fui','ter','ter','esse',
]);

function extractKeywords(comments) {
  const freq = new Map();
  for (const text of comments) {
    if (!text) continue;
    text
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS_PT.has(w))
      .forEach((w) => freq.set(w, (freq.get(w) || 0) + 1));
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word, count]) => ({ word, count }));
}

function generateSummary(dist, keywords) {
  const total = dist.total || 1;
  const posRate = (dist.positive || 0) / total;
  const negRate = (dist.negative || 0) / total;
  const topKw = keywords.slice(0, 3).map((k) => `"${k.word}"`).join(', ');

  if (posRate >= 0.7) {
    return `A maioria dos visitantes relata experiências positivas${topKw ? `, mencionando frequentemente ${topKw}` : ''}.`;
  }
  if (negRate >= 0.5) {
    return `Vários visitantes relataram experiências negativas${topKw ? `. Palavras frequentes: ${topKw}` : ''}. Verifique as avaliações antes de visitar.`;
  }
  if (negRate >= 0.3) {
    return `As avaliações são mistas${topKw ? `. Os visitantes mencionam ${topKw}` : ''}. Leia as avaliações recentes para mais detalhes.`;
  }
  return `Lugar com avaliações variadas${topKw ? `. Temas frequentes: ${topKw}` : ''}.`;
}

router.get('/:id/insights', async (req, res, next) => {
  try {
    const { id } = req.params;

    const place = await Place.findByPk(id, { attributes: ['id', 'alert_level', 'avg_rating', 'review_count'] });
    if (!place) return res.status(404).json({ error: 'Lugar não encontrado.' });

    const allReviews = await Review.findAll({
      where: { place_id: id },
      attributes: ['sentiment', 'sentiment_score', 'comment'],
      raw: true,
    });

    const counts = { positive: 0, neutral: 0, negative: 0 };
    for (const r of allReviews) {
      if (r.sentiment) counts[r.sentiment] = (counts[r.sentiment] || 0) + 1;
    }
    const analyzed = counts.positive + counts.neutral + counts.negative;
    const dist = {
      ...counts,
      total: analyzed,
      positive_pct: analyzed ? Math.round((counts.positive / analyzed) * 100) : 0,
      neutral_pct:  analyzed ? Math.round((counts.neutral  / analyzed) * 100) : 0,
      negative_pct: analyzed ? Math.round((counts.negative / analyzed) * 100) : 0,
    };

    const keywords = extractKeywords(allReviews.map((r) => r.comment));

    const summary_text = analyzed > 0
      ? generateSummary(dist, keywords)
      : 'Ainda não há avaliações suficientes para gerar uma análise.';

    res.json({
      sentiment_distribution: dist,
      top_keywords: keywords,
      summary_text,
      alert_level: place.alert_level,
      total_reviews: allReviews.length,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/places/:id/organizer-review ────────────────────────────────────

router.post('/:id/organizer-review', authenticate, validate(organizerReviewSchema), async (req, res, next) => {
  try {
    const eventId  = parseInt(req.params.id, 10);
    const reviewerId = req.user.id;

    const place = await Place.findByPk(eventId, { attributes: ['id', 'type', 'created_by'] });
    if (!place) return res.status(404).json({ error: 'Evento não encontrado.' });
    if (place.type !== 'event') return res.status(400).json({ error: 'Apenas eventos têm avaliação de organizador.' });
    if (place.created_by === reviewerId) return res.status(400).json({ error: 'Você não pode se auto-avaliar como organizador.' });

    const attended = await EventAttendee.findOne({ where: { event_id: eventId, user_id: reviewerId } });
    if (!attended) return res.status(403).json({ error: 'Apenas participantes do evento podem avaliar o organizador.' });

    const existing = await OrganizerReview.findOne({ where: { reviewer_id: reviewerId, event_id: eventId } });
    if (existing) return res.status(409).json({ error: 'Você já avaliou o organizador deste evento.' });

    const { rating, comment } = req.body;
    const review = await OrganizerReview.create({
      reviewer_id:  reviewerId,
      organizer_id: place.created_by,
      event_id:     eventId,
      rating,
      comment: comment ? stripTags(comment) : null,
    });

    // Recalcula média e contagem do organizador
    const stats = await OrganizerReview.findOne({
      where: { organizer_id: place.created_by },
      attributes: [
        [fn('AVG', col('rating')), 'avg'],
        [fn('COUNT', col('id')), 'total'],
      ],
      raw: true,
    });
    await User.update(
      {
        avg_organizer_rating:   Math.round(parseFloat(stats.avg) * 10) / 10,
        organizer_review_count: parseInt(stats.total, 10),
      },
      { where: { id: place.created_by } }
    );

    res.status(201).json({ review: review.toJSON() });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Você já avaliou o organizador deste evento.' });
    }
    next(err);
  }
});

// ── DELETE /api/places/:id ────────────────────────────────────────────────────

router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const place = await Place.findByPk(req.params.id);
    if (!place) return res.status(404).json({ error: 'Lugar não encontrado.' });

    if (place.created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão para remover este lugar.' });
    }

    // Cascade definido no banco (reviews, posts, alerts apagados automaticamente)
    await place.destroy();
    clearCache();
    res.json({ message: 'Lugar removido com sucesso.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
