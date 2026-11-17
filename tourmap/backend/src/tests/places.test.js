/**
 * Testes de lugares — usa jest.mock para isolar banco, geocoding e IA.
 */
const request = require('supertest');

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../models/index', () => ({
  User: { findOne: jest.fn(), findByPk: jest.fn() },
  Place: {
    findAll: jest.fn(),
    findByPk: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
  },
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
  haversineDistance: jest.fn().mockReturnValue(5),
  boundingBox: jest.fn().mockReturnValue({ minLat: -24, maxLat: -23, minLon: -47, maxLon: -46 }),
  reverseGeocode: jest.fn().mockResolvedValue({
    address: { country_code: 'br', city: 'São Paulo', state_code: 'BR-SP' },
  }),
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

function validToken(role = 'tourist') {
  return jwt.sign({ id: 1, name: 'Turista', email: 'a@a.com', role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

const mockUser = (overrides = {}) => ({
  id: 1, name: 'Turista', email: 'a@a.com', role: 'tourist', email_verified: true,
  avatar_url: null, toJSON() { return this; }, ...overrides,
});

const mockPlace = (overrides = {}) => ({
  id: 1, name: 'Parque Teste', category: 'natureza', latitude: -23.58, longitude: -46.65,
  avg_rating: 4.5, review_count: 10, is_free: true, alert_level: 'none', created_by: 1,
  toJSON() { return this; },
  update: jest.fn().mockResolvedValue(true),
  destroy: jest.fn().mockResolvedValue(true),
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

// ── GET /api/places ───────────────────────────────────────────────────────────

describe('GET /api/places', () => {
  it('retorna 200 com lista paginada', async () => {
    Place.findAll.mockResolvedValue([mockPlace()]);

    const res = await request(app).get('/api/places');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('aceita filtro de categoria válida', async () => {
    Place.findAll.mockResolvedValue([]);
    const res = await request(app).get('/api/places?category=natureza');
    expect(res.status).toBe(200);
  });

  it('rejeita categoria inválida', async () => {
    const res = await request(app).get('/api/places?category=invalida');
    expect(res.status).toBe(422);
  });

  it('aceita filtro geográfico lat+lng', async () => {
    Place.findAll.mockResolvedValue([mockPlace()]);
    const res = await request(app).get('/api/places?lat=-23.5&lng=-46.6&radius=10');
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toHaveProperty('distance_km');
  });

  it('rejeita lat sem lng', async () => {
    const res = await request(app).get('/api/places?lat=-23.5');
    expect(res.status).toBe(422);
  });

  it('aceita filtro is_free=true', async () => {
    Place.findAll.mockResolvedValue([]);
    const res = await request(app).get('/api/places?is_free=true');
    expect(res.status).toBe(200);
  });

  it('aceita filtro min_rating=4', async () => {
    Place.findAll.mockResolvedValue([mockPlace({ avg_rating: 4.5 })]);
    const res = await request(app).get('/api/places?min_rating=4');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('rejeita min_rating acima de 5', async () => {
    const res = await request(app).get('/api/places?min_rating=6');
    expect(res.status).toBe(422);
  });

  it('rejeita min_rating negativo', async () => {
    const res = await request(app).get('/api/places?min_rating=-1');
    expect(res.status).toBe(422);
  });
});

// ── GET /api/places/:id ───────────────────────────────────────────────────────

describe('GET /api/places/:id', () => {
  it('retorna 200 com dados do lugar', async () => {
    Place.findByPk.mockResolvedValue(mockPlace());
    Review.findAll.mockResolvedValue([]);

    const res = await request(app).get('/api/places/1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('place');
    expect(res.body).toHaveProperty('sentiment_summary');
  });

  it('retorna 404 para lugar inexistente', async () => {
    Place.findByPk.mockResolvedValue(null);

    const res = await request(app).get('/api/places/9999');
    expect(res.status).toBe(404);
  });
});

// ── POST /api/places ──────────────────────────────────────────────────────────

describe('POST /api/places', () => {
  const validBody = {
    name: 'Praia do Teste',
    description: 'Uma praia linda no litoral brasileiro.',
    address: 'Rua da Praia, 1',
    latitude: -23.5,
    longitude: -46.6,
    category: 'natureza',
    is_free: true,
  };

  it('retorna 401 sem token', async () => {
    const res = await request(app).post('/api/places').send(validBody);
    expect(res.status).toBe(401);
  });

  it('retorna 201 ao criar lugar válido', async () => {
    User.findOne.mockResolvedValue(mockUser());
    Place.create.mockResolvedValue(mockPlace());

    const res = await request(app)
      .post('/api/places')
      .set('Authorization', `Bearer ${validToken()}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('place');
  });

  it('retorna 422 se nome for muito curto', async () => {
    User.findOne.mockResolvedValue(mockUser());
    const res = await request(app)
      .post('/api/places')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ ...validBody, name: 'AB' });
    expect(res.status).toBe(422);
  });

  it('retorna 422 para latitude fora do range', async () => {
    User.findOne.mockResolvedValue(mockUser());
    const res = await request(app)
      .post('/api/places')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ ...validBody, latitude: 999 });
    expect(res.status).toBe(422);
  });

  it('retorna 422 para longitude fora do range', async () => {
    User.findOne.mockResolvedValue(mockUser());
    const res = await request(app)
      .post('/api/places')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ ...validBody, longitude: -999 });
    expect(res.status).toBe(422);
  });

  it('retorna 422 se coordenadas forem de fora do Brasil', async () => {
    User.findOne.mockResolvedValue(mockUser());
    const { reverseGeocode } = require('../utils/geocoding');
    reverseGeocode.mockResolvedValueOnce({ address: { country_code: 'us' } });

    const res = await request(app)
      .post('/api/places')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ ...validBody, latitude: 40.7, longitude: -74.0 });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Brasil/i);
  });
});

// ── PUT /api/places/:id ───────────────────────────────────────────────────────

describe('PUT /api/places/:id', () => {
  const validBody = {
    name: 'Parque Atualizado',
    description: 'Descrição atualizada com mais detalhes do lugar.',
    latitude: -23.5,
    longitude: -46.6,
    category: 'cultura',
  };

  it('retorna 401 sem token', async () => {
    const res = await request(app).put('/api/places/1').send(validBody);
    expect(res.status).toBe(401);
  });

  it('retorna 403 se não for o dono', async () => {
    User.findOne.mockResolvedValue(mockUser({ id: 2 }));
    Place.findByPk.mockResolvedValue(mockPlace({ created_by: 1 }));

    const res = await request(app)
      .put('/api/places/1')
      .set('Authorization', `Bearer ${jwt.sign({ id: 2, name: 'Outro', email: 'b@b.com', role: 'tourist' }, process.env.JWT_SECRET)}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('retorna 200 quando o dono atualiza', async () => {
    User.findOne.mockResolvedValue(mockUser());
    Place.findByPk.mockResolvedValue(mockPlace({ created_by: 1 }));

    const res = await request(app)
      .put('/api/places/1')
      .set('Authorization', `Bearer ${validToken()}`)
      .send(validBody);
    expect(res.status).toBe(200);
  });
});

// ── DELETE /api/places/:id ────────────────────────────────────────────────────

describe('DELETE /api/places/:id', () => {
  it('retorna 403 se não for o dono', async () => {
    User.findOne.mockResolvedValue(mockUser({ id: 2 }));
    Place.findByPk.mockResolvedValue(mockPlace({ created_by: 1 }));

    const res = await request(app)
      .delete('/api/places/1')
      .set('Authorization', `Bearer ${jwt.sign({ id: 2, name: 'Outro', email: 'b@b.com', role: 'tourist' }, process.env.JWT_SECRET)}`);
    expect(res.status).toBe(403);
  });

  it('retorna 200 quando o dono remove', async () => {
    User.findOne.mockResolvedValue(mockUser());
    Place.findByPk.mockResolvedValue(mockPlace({ created_by: 1 }));

    const res = await request(app)
      .delete('/api/places/1')
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(200);
  });

  it('retorna 404 para lugar inexistente', async () => {
    User.findOne.mockResolvedValue(mockUser());
    Place.findByPk.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/places/9999')
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(404);
  });
});
