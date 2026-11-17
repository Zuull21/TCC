/**
 * Testes de reviews — rota aninhada /api/places/:placeId/reviews
 */
const request = require('supertest');

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../models/index', () => ({
  User: { findOne: jest.fn(), findByPk: jest.fn() },
  Place: { findByPk: jest.fn(), findAll: jest.fn(), create: jest.fn(), findAndCountAll: jest.fn() },
  Review: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
  },
  Post: { findAndCountAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  Alert: {},
}));

jest.mock('../utils/geocoding', () => ({
  haversineDistance: jest.fn(),
  boundingBox: jest.fn(),
  reverseGeocode: jest.fn().mockResolvedValue(null),
}));

jest.mock('../services/aiService', () => ({
  analyzeSentiment: jest.fn().mockResolvedValue(null),
}));

jest.mock('../services/alertService', () => ({
  checkAndUpdateAlerts: jest.fn().mockResolvedValue(null),
}));

// ── Setup ─────────────────────────────────────────────────────────────────────

process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters-here';
process.env.NODE_ENV = 'test';

const { app } = require('../../server');
const { Place, Review, User } = require('../models/index');
const jwt = require('jsonwebtoken');

function validToken() {
  return jwt.sign({ id: 1, name: 'Turista', email: 'a@a.com', role: 'tourist' }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

const mockUser = () => ({
  id: 1, name: 'Turista', email: 'a@a.com', role: 'tourist', email_verified: true,
  avatar_url: null, toJSON() { return this; },
});

const mockPlace = (overrides = {}) => ({
  id: 1, name: 'Parque Teste', category: 'natureza', created_by: 1,
  avg_rating: 4.0, review_count: 5,
  toJSON() { return this; },
  update: jest.fn().mockResolvedValue(true),
  ...overrides,
});

const mockReview = (overrides = {}) => ({
  id: 1, user_id: 1, place_id: 1, rating: 5, comment: 'Lugar incrível!',
  sentiment: null, sentiment_score: null,
  toJSON() { return this; },
  update: jest.fn().mockResolvedValue(true),
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

// ── GET /api/places/:placeId/reviews ─────────────────────────────────────────

describe('GET /api/places/:placeId/reviews', () => {
  it('retorna 200 com lista de reviews paginada', async () => {
    Place.findByPk.mockResolvedValue(mockPlace());
    Review.findAndCountAll.mockResolvedValue({ count: 1, rows: [mockReview()] });

    const res = await request(app).get('/api/places/1/reviews');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total', 1);
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('retorna 404 se o lugar não existir', async () => {
    Place.findByPk.mockResolvedValue(null);

    const res = await request(app).get('/api/places/9999/reviews');
    expect(res.status).toBe(404);
  });

  it('respeita parâmetros de paginação', async () => {
    Place.findByPk.mockResolvedValue(mockPlace());
    Review.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

    const res = await request(app).get('/api/places/1/reviews?page=2&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(5);
  });
});

// ── POST /api/places/:placeId/reviews ────────────────────────────────────────

describe('POST /api/places/:placeId/reviews', () => {
  const validBody = { rating: 5, comment: 'Lugar muito bonito e bem cuidado!' };

  it('retorna 401 sem token', async () => {
    const res = await request(app).post('/api/places/1/reviews').send(validBody);
    expect(res.status).toBe(401);
  });

  it('retorna 404 se o lugar não existir', async () => {
    User.findOne.mockResolvedValue(mockUser());
    Place.findByPk.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/places/9999/reviews')
      .set('Authorization', `Bearer ${validToken()}`)
      .send(validBody);
    expect(res.status).toBe(404);
  });

  it('retorna 409 se o usuário já avaliou o lugar', async () => {
    User.findOne.mockResolvedValue(mockUser());
    Place.findByPk.mockResolvedValue(mockPlace());
    Review.findOne.mockResolvedValue(mockReview()); // já existe

    const res = await request(app)
      .post('/api/places/1/reviews')
      .set('Authorization', `Bearer ${validToken()}`)
      .send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/já avaliou/i);
  });

  it('retorna 201 ao criar review válida', async () => {
    User.findOne.mockResolvedValue(mockUser());
    Place.findByPk.mockResolvedValue(mockPlace());
    Review.findOne.mockResolvedValue(null); // não existe ainda
    Review.findAll.mockResolvedValue([{ avg: '4.5', total: '6' }]);
    Review.create.mockResolvedValue(mockReview());

    // Mock findOne para o recálculo de stats
    Review.findOne.mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ avg: '4.5', total: '6' });

    // Usa findAll para avg/count
    const mockPlace_ = mockPlace();
    Place.findByPk.mockResolvedValue(mockPlace_);

    // Para o recálculo, o service usa Review.findOne com attributes
    const mockStats = { avg: '4.5', total: '6' };

    // O service chama Review.findOne (com attributes avg/count) após criação
    Review.findOne
      .mockResolvedValueOnce(null)       // verificação de duplicata
      .mockResolvedValueOnce(mockStats); // recálculo de stats

    Review.create.mockResolvedValue(mockReview());

    const res = await request(app)
      .post('/api/places/1/reviews')
      .set('Authorization', `Bearer ${validToken()}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('review');
  });

  it('retorna 422 se rating for inválido (0)', async () => {
    User.findOne.mockResolvedValue(mockUser());
    const res = await request(app)
      .post('/api/places/1/reviews')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ ...validBody, rating: 0 });
    expect(res.status).toBe(422);
  });

  it('retorna 422 se rating for inválido (6)', async () => {
    User.findOne.mockResolvedValue(mockUser());
    const res = await request(app)
      .post('/api/places/1/reviews')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ ...validBody, rating: 6 });
    expect(res.status).toBe(422);
  });

  it('retorna 422 se o comment tiver menos de 10 chars', async () => {
    User.findOne.mockResolvedValue(mockUser());
    const res = await request(app)
      .post('/api/places/1/reviews')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ rating: 4, comment: 'Curto' });
    expect(res.status).toBe(422);
  });

  it('retorna 422 se o comment tiver mais de 1000 chars', async () => {
    User.findOne.mockResolvedValue(mockUser());
    const res = await request(app)
      .post('/api/places/1/reviews')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ rating: 4, comment: 'A'.repeat(1001) });
    expect(res.status).toBe(422);
  });
});
