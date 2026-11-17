/**
 * recommendationService.js — "Recomendados para você"
 *
 * Recomendação baseada em conteúdo, explicável, sem treino:
 *
 *   1. Perfil do usuário: categorias que ele avaliou bem (nota ≥ 4 ou sentimento
 *      positivo) ganham peso; categorias que avaliou mal perdem.
 *   2. Candidatos: lugares que ele ainda não avaliou, sem alerta de segurança alto
 *      e, se forem eventos, que ainda não aconteceram.
 *   3. Pontuação de cada candidato:
 *        0,50 · afinidade com a categoria       (0 a 1, do perfil)
 *        0,35 · aprovação pelo sentimento       (% de reviews positivas, suavizada)
 *        0,15 · popularidade                    (nº de reviews, satura em 20)
 *
 * A aprovação é suavizada (média bayesiana com 3 reviews "fictícias" a 50%) para
 * que um lugar com 1 review positiva não passe na frente de um com 40 reviews e 90%.
 *
 * Sem histórico (visitante ou usuário novo), a afinidade é zero para todos e a
 * lista vira "mais bem avaliados pelo sentimento".
 */

const { Op, literal } = require('sequelize');

const WEIGHTS = { affinity: 0.5, approval: 0.35, popularity: 0.15 };
const PRIOR_REVIEWS = 3;
const PRIOR_APPROVAL = 0.5;
const POPULARITY_CAP = 20;

const CATEGORY_LABELS = {
  musica: 'Música', cultura: 'Cultura', esporte: 'Esporte',
  gastronomia: 'Gastronomia', natureza: 'Natureza', arte: 'Arte',
};

/**
 * Perfil de afinidade por categoria, normalizado para 0..1.
 * @param {{ category: string, rating: number, sentiment: string|null }[]} userReviews
 * @returns {Record<string, number>}
 */
function buildProfile(userReviews) {
  const raw = {};
  for (const r of userReviews) {
    if (!r.category) continue;
    const liked    = r.rating >= 4 || r.sentiment === 'positive';
    const disliked = r.rating <= 2 || r.sentiment === 'negative';
    const delta = liked && !disliked ? 1 : disliked && !liked ? -0.5 : 0;
    raw[r.category] = (raw[r.category] || 0) + delta;
  }
  const max = Math.max(0, ...Object.values(raw));
  if (max === 0) return {};
  return Object.fromEntries(Object.entries(raw).map(([c, v]) => [c, Math.max(0, v) / max]));
}

/**
 * Pontua e ordena candidatos. Função pura (sem banco) para ser testável.
 * @param {{ category: string, positive_reviews: number, analyzed_reviews: number, review_count: number }[]} places
 * @param {Record<string, number>} profile
 */
function scorePlaces(places, profile) {
  return places
    .map((p) => {
      const analyzed  = Number(p.analyzed_reviews) || 0;
      const positives = Number(p.positive_reviews) || 0;
      const affinity   = profile[p.category] || 0;
      const approval   = (positives + PRIOR_REVIEWS * PRIOR_APPROVAL) / (analyzed + PRIOR_REVIEWS);
      const popularity = Math.min(Number(p.review_count) || 0, POPULARITY_CAP) / POPULARITY_CAP;
      const score = WEIGHTS.affinity * affinity + WEIGHTS.approval * approval + WEIGHTS.popularity * popularity;

      let reason;
      if (affinity >= 0.5) reason = `Porque você curtiu ${CATEGORY_LABELS[p.category] || p.category}`;
      else if (analyzed >= 3 && positives / analyzed >= 0.7) reason = `${Math.round((100 * positives) / analyzed)}% das avaliações são positivas`;
      else reason = 'Popular na região';

      return { ...p, score: Math.round(score * 1000) / 1000, positive_pct: analyzed ? Math.round((100 * positives) / analyzed) : null, reason };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * suggestDestinations — recomendações para um usuário (ou visitante, se userId nulo).
 * @param {number|null} userId
 * @param {{ limit?: number }} [opts]
 */
async function suggestDestinations(userId, { limit = 6 } = {}) {
  const { Place, Review } = require('../models/index');

  let profile = {};
  let reviewedIds = [];
  if (userId) {
    const history = await Review.findAll({
      where: { user_id: userId },
      attributes: ['place_id', 'rating', 'sentiment'],
      include: [{ model: Place, as: 'place', attributes: ['category'] }],
    });
    reviewedIds = history.map((r) => r.place_id);
    profile = buildProfile(history.map((r) => ({
      category: r.place?.category, rating: r.rating, sentiment: r.sentiment,
    })));
  }

  const today = new Date().toISOString().slice(0, 10);
  const candidates = await Place.findAll({
    where: {
      alert_level: { [Op.ne]: 'high' },
      ...(reviewedIds.length ? { id: { [Op.notIn]: reviewedIds } } : {}),
      [Op.or]: [{ event_date: null }, { event_date: { [Op.gte]: today } }],
    },
    attributes: {
      include: [
        [literal(`(SELECT COUNT(*) FROM reviews WHERE reviews.place_id = Place.id AND reviews.sentiment = 'positive')`), 'positive_reviews'],
        [literal(`(SELECT COUNT(*) FROM reviews WHERE reviews.place_id = Place.id AND reviews.sentiment IS NOT NULL)`), 'analyzed_reviews'],
      ],
    },
    // Pré-seleção barata no banco; a pontuação final é feita em memória
    order: [['review_count', 'DESC'], ['avg_rating', 'DESC']],
    limit: 200,
    raw: true,
  });

  return {
    personalized: Object.keys(profile).length > 0,
    items: scorePlaces(candidates, profile).slice(0, limit),
  };
}

module.exports = { suggestDestinations, scorePlaces, buildProfile, WEIGHTS };
