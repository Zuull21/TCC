/**
 * recommendation.test.js — "Recomendados para você" (recommendationService + rota)
 */
const request = require('supertest');

jest.mock('../models/index', () => ({
  Place:  { findAll: jest.fn() },
  Review: { findAll: jest.fn() },
}));

process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters-here';

const jwt = require('jsonwebtoken');
const { buildProfile, scorePlaces } = require('../services/recommendationService');
const { Place, Review } = require('../models/index');
const { app } = require('../../server');

beforeEach(() => jest.clearAllMocks());

const place = (o) => ({ id: 1, name: 'Lugar', category: 'arte', positive_reviews: 0, analyzed_reviews: 0, review_count: 0, ...o });

describe('buildProfile', () => {
  it('categoria avaliada bem tem afinidade máxima; mal avaliada fica em zero', () => {
    const p = buildProfile([
      { category: 'gastronomia', rating: 5, sentiment: 'positive' },
      { category: 'gastronomia', rating: 4, sentiment: null },
      { category: 'musica',      rating: 1, sentiment: 'negative' },
    ]);
    expect(p.gastronomia).toBe(1);
    expect(p.musica).toBe(0);
  });

  it('sem histórico → perfil vazio', () => {
    expect(buildProfile([])).toEqual({});
  });
});

describe('scorePlaces', () => {
  it('afinidade com a categoria pesa mais que aprovação', () => {
    const [first] = scorePlaces([
      place({ id: 1, category: 'arte',        positive_reviews: 9, analyzed_reviews: 10, review_count: 10 }),
      place({ id: 2, category: 'gastronomia', positive_reviews: 6, analyzed_reviews: 10, review_count: 10 }),
    ], { gastronomia: 1 });
    expect(first.id).toBe(2);
    expect(first.reason).toMatch(/Gastronomia/);
  });

  it('suavização: 1 review positiva não vence 40 reviews com 90%', () => {
    const [first] = scorePlaces([
      place({ id: 1, positive_reviews: 1,  analyzed_reviews: 1,  review_count: 1 }),
      place({ id: 2, positive_reviews: 36, analyzed_reviews: 40, review_count: 40 }),
    ], {});
    expect(first.id).toBe(2);
    expect(first.reason).toBe('90% das avaliações são positivas');
  });
});

describe('GET /api/places/recommended', () => {
  const candidates = [
    place({ id: 10, category: 'natureza',    positive_reviews: 8, analyzed_reviews: 10, review_count: 12 }),
    place({ id: 11, category: 'gastronomia', positive_reviews: 5, analyzed_reviews: 10, review_count: 12 }),
  ];

  it('visitante → ranking por sentimento, não personalizado', async () => {
    Place.findAll.mockResolvedValue(candidates);
    const res = await request(app).get('/api/places/recommended');
    expect(res.status).toBe(200);
    expect(res.body.personalized).toBe(false);
    expect(res.body.items[0].id).toBe(10);
    expect(Review.findAll).not.toHaveBeenCalled();
  });

  it('usuário com histórico → personalizado e exclui lugares já avaliados', async () => {
    Review.findAll.mockResolvedValue([{ place_id: 3, rating: 5, sentiment: 'positive', place: { category: 'gastronomia' } }]);
    Place.findAll.mockResolvedValue(candidates);
    const token = jwt.sign({ id: 7 }, process.env.JWT_SECRET);

    const res = await request(app).get('/api/places/recommended').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.personalized).toBe(true);
    expect(res.body.items[0].id).toBe(11);
    const { Op } = require('sequelize');
    expect(Place.findAll.mock.calls[0][0].where.id[Op.notIn]).toEqual([3]);
  });
});
