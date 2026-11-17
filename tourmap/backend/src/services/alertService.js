const { Op } = require('sequelize');
const { containsRiskKeywords } = require('./aiService');

const MIN_REVIEWS_FOR_ANALYSIS = 3;
const RISK_RATING_THRESHOLD = 3.0;
const MIN_REVIEWS_FOR_RATING_ALERT = 5;

function buildAlertMessage(placeName, level, reasons) {
  const msgs = {
    high_sentiment:
      `Atenção: "${placeName}" está recebendo muitas avaliações negativas. ` +
      `Verifique as condições antes de visitar.`,
    high_keywords:
      `Alerta de segurança: relatos preocupantes foram identificados ` +
      `nas avaliações recentes de "${placeName}". Tome precauções extras.`,
    medium_sentiment:
      `"${placeName}" recebeu avaliações mistas recentemente. ` +
      `Confira as reviews mais recentes antes de planejar sua visita.`,
    medium_rating:
      `A nota média de "${placeName}" caiu abaixo de ${RISK_RATING_THRESHOLD}. ` +
      `Verifique as condições atuais do local.`,
    low:
      `Algumas avaliações negativas foram registradas recentemente em "${placeName}". ` +
      `Fique atento às reviews mais recentes.`,
    none: `"${placeName}" não apresenta alertas no momento.`,
  };
  return msgs[reasons[0]] || msgs[level] || msgs.none;
}

async function checkAndUpdateAlerts(placeId, io = null) {
  try {
    const { Review, Place, Alert, EventAttendee } = require('../models/index');

    const reviews = await Review.findAll({
      where: { place_id: placeId },
      order: [['created_at', 'DESC']],
      limit: 10,
      attributes: ['sentiment', 'comment', 'rating'],
      raw: true,
    });

    if (reviews.length < MIN_REVIEWS_FOR_ANALYSIS) return null;

    const place = await Place.findByPk(placeId, {
      attributes: ['id', 'name', 'avg_rating', 'review_count', 'alert_level'],
    });
    if (!place) return null;

    const withSentiment = reviews.filter((r) => r.sentiment !== null);
    const negCount = withSentiment.filter((r) => r.sentiment === 'negative').length;
    const negRate = withSentiment.length > 0 ? negCount / withSentiment.length : 0;

    const riskFound = reviews
      .filter((r) => r.comment)
      .flatMap((r) => containsRiskKeywords(r.comment));
    const hasRiskKeywords = riskFound.length > 0;

    const avgRating = parseFloat(place.avg_rating);
    const hasLowRating =
      place.review_count >= MIN_REVIEWS_FOR_RATING_ALERT &&
      avgRating < RISK_RATING_THRESHOLD;

    let newLevel = 'none';
    let reasons = [];

    if (negRate >= 0.5 || hasRiskKeywords) {
      newLevel = 'high';
      reasons = hasRiskKeywords ? ['high_keywords'] : ['high_sentiment'];
    } else if (negRate >= 0.3 || hasLowRating) {
      newLevel = 'medium';
      reasons = hasLowRating ? ['medium_rating'] : ['medium_sentiment'];
    } else if (negRate > 0.2) { // uma única negativa em 5 não basta para alertar
      newLevel = 'low';
      reasons = ['low'];
    }

    if (newLevel === place.alert_level) return null;

    await Place.update({ alert_level: newLevel }, { where: { id: placeId } });

    await Alert.update(
      { is_active: false, resolved_at: new Date() },
      { where: { place_id: placeId, is_active: true } }
    );

    let newAlert = null;
    if (newLevel !== 'none') {
      const trigger =
        hasRiskKeywords ? 'risk_keywords' :
        hasLowRating ? 'low_rating' :
        'sentiment_analysis';

      newAlert = await Alert.create({
        place_id: placeId,
        level: newLevel,
        message: buildAlertMessage(place.name, newLevel, reasons),
        trigger_type: trigger,
        is_active: true,
      });
    }

    if (io) {
      // Atualiza o banner em tempo real para quem está visualizando o lugar
      io.to(`place:${placeId}`).emit('alert:updated', {
        placeId,
        level: newLevel,
        message: newAlert ? newAlert.message : `Alerta removido de "${place.name}".`,
        alert: newAlert ? newAlert.toJSON() : null,
      });

      // Notifica individualmente apenas usuários com relação com o lugar
      if (newLevel !== 'none' && newAlert) {
        const [attendeeRows, reviewRows] = await Promise.all([
          EventAttendee.findAll({
            where: { event_id: placeId, status: { [Op.in]: ['going', 'maybe'] } },
            attributes: ['user_id'],
            raw: true,
          }),
          Review.findAll({
            where: { place_id: placeId },
            attributes: ['user_id'],
            raw: true,
          }),
        ]);

        const rsvpIds   = new Set(attendeeRows.map((r) => r.user_id));
        const reviewIds = new Set(reviewRows.map((r) => r.user_id));
        const allIds    = new Set([...rsvpIds, ...reviewIds]);

        const base = {
          placeId,
          placeName:  place.name,
          alertLevel: newLevel,
          message:    newAlert.message,
        };

        for (const userId of allIds) {
          const triggerType = rsvpIds.has(userId) ? 'rsvp' : 'review';
          io.to(`user:${userId}`).emit('alert:new', { ...base, triggerType });
        }
      }
    }

    console.log(`[AlertService] place#${placeId} → alert_level: ${place.alert_level} → ${newLevel}`);
    return newAlert;
  } catch (err) {
    console.error('[AlertService] checkAndUpdateAlerts error:', err.message);
    return null;
  }
}

async function expireOutdatedAlerts() {
  const { Alert } = require('../models/index');
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [count] = await Alert.update(
    { is_active: false, resolved_at: new Date() },
    { where: { is_active: true, created_at: { [Op.lt]: cutoff } } }
  );
  if (count > 0) console.log(`[AlertService] ${count} alertas expirados desativados.`);
}

module.exports = { checkAndUpdateAlerts, expireOutdatedAlerts };
