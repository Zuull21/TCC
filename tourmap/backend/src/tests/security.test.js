/**
 * security.test.js
 * Testes de segurança: XSS, SQL Injection, autenticação, autorização,
 * validação de input e rate limiting.
 */
const request = require('supertest');

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../models/index', () => ({
  User:             { findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  Place:            { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), update: jest.fn(), destroy: jest.fn() },
  Review:           { findOne: jest.fn(), findAll: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn() },
  Post:             { findAndCountAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  Alert:            { findAndCountAll: jest.fn(), update: jest.fn(), create: jest.fn() },
  PostLike:         { findOrCreate: jest.fn(), destroy: jest.fn() },
  VerificationCode: { findOne: jest.fn(), create: jest.fn(), update: jest.fn() },
}));

jest.mock('../utils/geocoding', () => ({
  haversineDistance: jest.fn().mockReturnValue(5),
  boundingBox:       jest.fn().mockReturnValue({ minLat: -24, maxLat: -23, minLon: -47, maxLon: -46 }),
  reverseGeocode:    jest.fn().mockResolvedValue({ address: { country_code: 'br' } }),
}));

jest.mock('../services/aiService',   () => ({
  analyzeSentiment:    jest.fn().mockResolvedValue({ sentiment: 'positive', score: 0.9 }),
  containsRiskKeywords: jest.fn().mockReturnValue([]),
}));
jest.mock('../services/alertService', () => ({
  checkAndUpdateAlerts: jest.fn().mockResolvedValue(null),
}));

// ── Env ───────────────────────────────────────────────────────────────────────

process.env.JWT_SECRET  = 'test-secret-with-at-least-32-characters-here';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV    = 'test';

const { app } = require('../../server');
const { User, Place, Review, Alert, Post, PostLike } = require('../models/index');
const { sequelize } = require('../config/db');
const jwt = require('jsonwebtoken');

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockUser = (o = {}) => ({
  id: 1, name: 'Turista', email: 't@t.com',
  email_verified: true, role: 'tourist', avatar_url: null,
  toJSON() { return { ...this }; },
  update: jest.fn().mockResolvedValue(true),
  ...o,
});

const mockPlace = (o = {}) => ({
  id: 1, name: 'Praia', category: 'natureza',
  latitude: -23.0, longitude: -46.0,
  created_by: 1, avg_rating: 4.0, review_count: 2,
  alert_level: 'none',
  toJSON() { return { ...this }; },
  update: jest.fn().mockResolvedValue(true),
  destroy: jest.fn().mockResolvedValue(true),
  ...o,
});

const mockReview = (o = {}) => ({
  id: 1, user_id: 1, place_id: 1, rating: 4, comment: 'Bom lugar.',
  sentiment: null, sentiment_score: null,
  toJSON() { return { ...this }; },
  update: jest.fn().mockResolvedValue(true),
  ...o,
});

function authHeader(user = mockUser()) {
  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return `Bearer ${token}`;
}

beforeEach(() => jest.clearAllMocks());

// ═══════════════════════════════════════════════════════════════════════════════
// XSS
// ═══════════════════════════════════════════════════════════════════════════════

describe('XSS — sanitização de input', () => {
  it('remove tags <script> do comment de review antes de salvar', async () => {
    const malicious = '<script>alert("xss")</script>Ótimo lugar, recomendo muito!';

    User.findOne.mockResolvedValue(mockUser());
    Place.findByPk.mockResolvedValue(mockPlace());
    Review.findOne
      .mockResolvedValueOnce(null)    // sem review duplicada
      .mockResolvedValueOnce({ avg: '4.0', total: '3' }); // recálculo stats
    Review.create.mockImplementation(({ comment }) => {
      // Valida que o que foi salvo NÃO contém HTML
      expect(comment).not.toMatch(/<script>/i);
      expect(comment).not.toMatch(/<\/script>/i);
      return Promise.resolve(mockReview({ comment }));
    });

    const res = await request(app)
      .post('/api/places/1/reviews')
      .set('Authorization', authHeader())
      .send({ rating: 5, comment: malicious });

    // A rota deve aceitar (201) ou rejeitar se o campo ficou vazio após sanitização
    expect([201, 422]).toContain(res.status);
    if (res.status === 201) {
      expect(JSON.stringify(res.body)).not.toContain('<script>');
    }
  });

  it('remove tags HTML de campos de busca (query param)', async () => {
    Place.findAll.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/places?search=<img src=x onerror=alert(1)>praia');

    expect(res.status).toBe(200);
    // Busca deve funcionar normalmente sem executar JS
    expect(JSON.stringify(res.body)).not.toContain('<img');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SQL Injection
// ═══════════════════════════════════════════════════════════════════════════════

describe('SQL Injection — queries parametrizadas', () => {
  it("busca com payload SQL não vaza dados ('; DROP TABLE places; --)", async () => {
    Place.findAll.mockResolvedValue([]); // Sequelize usa prepared statements

    const res = await request(app)
      .get("/api/places?search='; DROP TABLE places; --");

    // A rota deve responder normalmente (busca não encontra nada)
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    // Nenhum dado "vaza" — Place.findAll foi chamado com o payload como literal
    const callArg = Place.findAll.mock.calls[0]?.[0];
    const { Op } = require('sequelize');
    // Op.or e Op.like são chaves Symbol, que JSON.stringify descarta
    const whereStr = String(callArg?.where?.[Op.or]?.[0]?.name?.[Op.like] ?? '');
    expect(whereStr).toContain("DROP TABLE"); // string literal, não executada
  });

  it("parâmetro de ID com SQL injection retorna 422 ou 404", async () => {
    const res = await request(app).get("/api/places/1 OR 1=1");
    // Joi deve rejeitar id não numérico, ou a rota retorna 404
    expect([400, 404, 422]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Autenticação
// ═══════════════════════════════════════════════════════════════════════════════

describe('Autenticação — proteção de rotas', () => {
  it('retorna 401 ao acessar rota protegida sem token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    // Nunca vazar detalhes do erro
    expect(res.body.error).not.toMatch(/jwt|token|secret/i);
  });

  it('retorna 401 com token malformado', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.invalido.invalido');
    expect(res.status).toBe(401);
  });

  it('retorna 401 com token expirado', async () => {
    const expiredToken = jwt.sign(
      { id: 1, name: 'X', email: 'x@x.com', role: 'tourist' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' } // já expirado
    );
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  it('retorna 401 com token assinado com secret errado', async () => {
    const wrongToken = jwt.sign(
      { id: 1, name: 'X', email: 'x@x.com', role: 'tourist' },
      'wrong-secret-completely-different',
      { expiresIn: '1h' }
    );
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${wrongToken}`);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Autorização
// ═══════════════════════════════════════════════════════════════════════════════

describe('Autorização — ownership de recursos', () => {
  it('retorna 403 ao tentar deletar lugar de outro usuário', async () => {
    const otherUser = mockUser({ id: 2 });
    User.findOne.mockResolvedValue(otherUser);
    Place.findByPk.mockResolvedValue(mockPlace({ created_by: 1 })); // lugar do user 1

    const tokenUser2 = jwt.sign(
      { id: 2, name: 'Outro', email: 'o@o.com', role: 'tourist' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const res = await request(app)
      .delete('/api/places/1')
      .set('Authorization', `Bearer ${tokenUser2}`);

    expect(res.status).toBe(403);
  });

  it('retorna 200 quando o dono deleta o próprio lugar', async () => {
    User.findOne.mockResolvedValue(mockUser({ id: 1 }));
    Place.findByPk.mockResolvedValue(mockPlace({ created_by: 1 }));

    const res = await request(app)
      .delete('/api/places/1')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
  });
});

describe('Autorização — alertas de segurança', () => {
  const guia = (id) => mockUser({ id, role: 'guide' });
  const tokenDe = (u) => jwt.sign({ id: u.id, name: u.name, email: u.email, role: u.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const body = { place_id: 1, level: 'high', message: 'Relatos de assalto na saída do evento.' };

  it('retorna 403 quando o guia emite alerta em lugar de outra pessoa', async () => {
    const u = guia(2);
    User.findOne.mockResolvedValue(u);
    Place.findByPk.mockResolvedValue(mockPlace({ created_by: 1 }));

    const res = await request(app).post('/api/alerts').set('Authorization', `Bearer ${tokenDe(u)}`).send(body);

    expect(res.status).toBe(403);
    expect(Alert.create).not.toHaveBeenCalled();
  });

  it('retorna 201 quando o guia emite alerta no próprio lugar', async () => {
    const u = guia(1);
    User.findOne.mockResolvedValue(u);
    Place.findByPk.mockResolvedValue(mockPlace({ created_by: 1 }));
    Alert.update.mockResolvedValue([0]);
    Alert.create.mockResolvedValue({ toJSON: () => ({ id: 9, place_id: 1, level: 'high' }) });

    const res = await request(app).post('/api/alerts').set('Authorization', `Bearer ${tokenDe(u)}`).send(body);

    expect(res.status).toBe(201);
  });
});

describe('Curtidas — uma por usuário', () => {
  const mockPost = (likes) => ({
    id: 5, likes_count: likes,
    increment: jest.fn(), decrement: jest.fn(),
    reload: jest.fn(function () { return this; }),
  });

  beforeEach(() => {
    jest.spyOn(sequelize, 'transaction').mockImplementation(async (fn) => fn({}));
    User.findOne.mockResolvedValue(mockUser());
  });
  afterEach(() => jest.restoreAllMocks());

  it('a primeira curtida soma 1', async () => {
    const post = mockPost(3);
    Post.findByPk.mockResolvedValue(post);
    PostLike.findOrCreate.mockResolvedValue([{}, true]);

    const res = await request(app).post('/api/posts/5/like').set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.liked).toBe(true);
    expect(post.increment).toHaveBeenCalled();
    expect(post.decrement).not.toHaveBeenCalled();
  });

  it('curtir de novo desfaz a curtida, sem somar outra vez', async () => {
    const post = mockPost(4);
    Post.findByPk.mockResolvedValue(post);
    PostLike.findOrCreate.mockResolvedValue([{}, false]);

    const res = await request(app).post('/api/posts/5/like').set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.liked).toBe(false);
    expect(post.increment).not.toHaveBeenCalled();
    expect(PostLike.destroy).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Reviews — unicidade
// ═══════════════════════════════════════════════════════════════════════════════

describe('Reviews — integridade', () => {
  it('retorna 409 ao tentar criar segunda review no mesmo lugar', async () => {
    User.findOne.mockResolvedValue(mockUser());
    Place.findByPk.mockResolvedValue(mockPlace());
    Review.findOne.mockResolvedValue(mockReview()); // já existe

    const res = await request(app)
      .post('/api/places/1/reviews')
      .set('Authorization', authHeader())
      .send({ rating: 4, comment: 'Segunda avaliação do mesmo lugar!' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/já avaliou/i);
  });

  it('retorna 422 para rating 0 (abaixo do mínimo)', async () => {
    User.findOne.mockResolvedValue(mockUser());

    const res = await request(app)
      .post('/api/places/1/reviews')
      .set('Authorization', authHeader())
      .send({ rating: 0, comment: 'Comentário longo o suficiente.' });

    expect(res.status).toBe(422);
  });

  it('retorna 422 para rating 6 (acima do máximo)', async () => {
    User.findOne.mockResolvedValue(mockUser());

    const res = await request(app)
      .post('/api/places/1/reviews')
      .set('Authorization', authHeader())
      .send({ rating: 6, comment: 'Comentário longo o suficiente.' });

    expect(res.status).toBe(422);
  });

  it('retorna 201 para rating 3 (válido)', async () => {
    User.findOne.mockResolvedValue(mockUser());
    Place.findByPk.mockResolvedValue(mockPlace());
    Review.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ avg: '3.0', total: '1' });
    Review.create.mockResolvedValue(mockReview({ rating: 3 }));

    const res = await request(app)
      .post('/api/places/1/reviews')
      .set('Authorization', authHeader())
      .send({ rating: 3, comment: 'Lugar razoável, nada de especial aqui.' });

    expect(res.status).toBe(201);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Validação de coordenadas
// ═══════════════════════════════════════════════════════════════════════════════

describe('Validação de coordenadas geográficas', () => {
  it('retorna 422 para latitude > 90', async () => {
    User.findOne.mockResolvedValue(mockUser());

    const res = await request(app)
      .post('/api/places')
      .set('Authorization', authHeader())
      .send({
        name: 'Lugar Inválido',
        category: 'natureza',
        latitude: 999,
        longitude: -46.0,
      });

    expect(res.status).toBe(422);
  });

  it('retorna 422 para longitude < -180', async () => {
    User.findOne.mockResolvedValue(mockUser());

    const res = await request(app)
      .post('/api/places')
      .set('Authorization', authHeader())
      .send({
        name: 'Lugar Inválido',
        category: 'natureza',
        latitude: -23.0,
        longitude: -999,
      });

    expect(res.status).toBe(422);
  });

  it('retorna 422 para coordenadas fora do Brasil', async () => {
    const { reverseGeocode } = require('../utils/geocoding');
    reverseGeocode.mockResolvedValueOnce({ address: { country_code: 'us' } });
    User.findOne.mockResolvedValue(mockUser());

    const res = await request(app)
      .post('/api/places')
      .set('Authorization', authHeader())
      .send({
        name: 'Central Park',
        category: 'natureza',
        latitude: 40.785,
        longitude: -73.968,
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Brasil/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Rate Limiting — teste funcional independente
// ═══════════════════════════════════════════════════════════════════════════════

describe('Rate Limiting — comportamento do middleware', () => {
  it('bloqueia com 429 após exceder o limite configurado', async () => {
    // Cria uma mini-app isolada com rate limit de 2 req/minuto
    const express = require('express');
    const rateLimit = require('express-rate-limit');

    const testApp = express();
    const limiter = rateLimit({ windowMs: 60_000, max: 2, legacyHeaders: false, standardHeaders: 'draft-7' });
    testApp.use(express.json());
    testApp.post('/limited', limiter, (_req, res) => res.json({ ok: true }));

    // Primeira e segunda → OK
    await request(testApp).post('/limited').send({});
    await request(testApp).post('/limited').send({});
    // Terceira → 429
    const res = await request(testApp).post('/limited').send({});

    expect(res.status).toBe(429);
    expect(res.headers.ratelimit).toMatch(/limit=2/);
  });

  it('headers RateLimit-Limit são enviados nas respostas (draft-7)', async () => {
    const express = require('express');
    const rateLimit = require('express-rate-limit');

    const headerApp = express();
    const limiter = rateLimit({ windowMs: 60_000, max: 100, standardHeaders: 'draft-7', legacyHeaders: false });
    headerApp.use(limiter);
    headerApp.get('/ping', (_req, res) => res.json({ ok: true }));

    const res = await request(headerApp).get('/ping');

    expect(res.status).toBe(200);
    // Headers de rate limit devem estar presentes
    expect(res.headers.ratelimit).toMatch(/limit=100/);
    expect(res.headers.ratelimit).toMatch(/remaining=99/);
  });
});
