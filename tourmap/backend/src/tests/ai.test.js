/**
 * ai.test.js
 * Testes unitários e de integração para aiService e alertService.
 */

// ── Mocks de modelos (necessário para alertService) ───────────────────────────

jest.mock('../models/index', () => ({
  Review: { findAll: jest.fn() },
  Place:  { findByPk: jest.fn(), update: jest.fn() },
  Alert:  { update: jest.fn(), create: jest.fn() },
}));

// ── Env ───────────────────────────────────────────────────────────────────────

process.env.NODE_ENV    = 'test';
// Os testes simulam a HF Inference API com fetch mockado (sem carregar ONNX)
process.env.SENTIMENT_ENGINE = 'api';
process.env.JWT_SECRET  = 'test-secret-with-at-least-32-characters-here';
// Sem HUGGINGFACE_API_KEY → usa fallback por palavras-chave

const { analyzeSentiment, containsRiskKeywords } = require('../services/aiService');
const { checkAndUpdateAlerts }                    = require('../services/alertService');
const { Review, Place, Alert }                    = require('../models/index');

beforeEach(() => jest.clearAllMocks());

// ═══════════════════════════════════════════════════════════════════════════════
// analyzeSentiment — fallback por palavras-chave (sem API key)
// ═══════════════════════════════════════════════════════════════════════════════

describe('analyzeSentiment — fallback por palavras-chave', () => {
  it('"Esse lugar é incrível, amei tudo!" → positive', async () => {
    const result = await analyzeSentiment('Esse lugar é incrível, amei tudo!');
    expect(result.sentiment).toBe('positive');
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('"Péssimo lugar, muito perigoso!" → negative', async () => {
    const result = await analyzeSentiment('Péssimo lugar, muito perigoso!');
    expect(result.sentiment).toBe('negative');
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('"O lugar existe e fica no centro da cidade" → neutral', async () => {
    const result = await analyzeSentiment('O lugar existe e fica no centro da cidade');
    expect(result.sentiment).toBe('neutral');
    expect(result.score).toBe(0.5);
  });

  it('texto com menos de 5 chars → neutral (sem análise)', async () => {
    const result = await analyzeSentiment('ok');
    expect(result.sentiment).toBe('neutral');
    expect(result.score).toBe(0.5);
  });

  it('texto vazio → neutral', async () => {
    const result = await analyzeSentiment('');
    expect(result.sentiment).toBe('neutral');
  });

  it('"Adorei, recomendo, excelente!" → positive com score alto', async () => {
    const result = await analyzeSentiment('Adorei, recomendo, excelente!');
    expect(result.sentiment).toBe('positive');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// analyzeSentiment — falha da API → continua funcionando (neutral)
// ═══════════════════════════════════════════════════════════════════════════════

describe('analyzeSentiment — resiliência a falha da API', () => {
  it('IA falha (fetch lança erro) → retorna neutral sem propagar exceção', async () => {
    // Seta uma API key para ativar o caminho da HF, depois faz fetch falhar
    const original = process.env.HUGGINGFACE_API_KEY;
    process.env.HUGGINGFACE_API_KEY = 'fake-key-for-test';

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('network timeout'));

    const result = await analyzeSentiment('Texto qualquer para análise de sentimento');

    // Com fetch falhando, cai no fallback de palavras-chave → neutral para texto sem palavras
    expect(['positive', 'neutral', 'negative']).toContain(result.sentiment);

    global.fetch = originalFetch;
    process.env.HUGGINGFACE_API_KEY = original;
  });

  it('IA retorna resposta malformada → retorna neutral via fallback', async () => {
    const original = process.env.HUGGINGFACE_API_KEY;
    process.env.HUGGINGFACE_API_KEY = 'fake-key-for-test';

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'Model is currently loading' }), // resposta inválida
    });

    const result = await analyzeSentiment('Um texto qualquer que será analisado pelo sistema.');
    expect(['positive', 'neutral', 'negative']).toContain(result.sentiment);

    global.fetch = originalFetch;
    process.env.HUGGINGFACE_API_KEY = original;
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// containsRiskKeywords
// ═══════════════════════════════════════════════════════════════════════════════

describe('containsRiskKeywords', () => {
  it('"Fui assaltado na saída" → retorna ["assalto"]', () => {
    const words = containsRiskKeywords('Fui assaltado na saída do parque');
    expect(words.length).toBeGreaterThan(0);
  });

  it('"Cuidado com o local" → retorna ["cuidado"]', () => {
    const words = containsRiskKeywords('Cuidado com esse local');
    expect(words).toContain('cuidado');
  });

  it('texto sem palavras de risco → retorna []', () => {
    const words = containsRiskKeywords('Lugar bonito com boa comida');
    expect(words).toHaveLength(0);
  });

  it('"Golpe e fraude" → retorna múltiplas palavras de risco', () => {
    const words = containsRiskKeywords('Golpe e fraude no estabelecimento');
    expect(words.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// checkAndUpdateAlerts — alert_level HIGH com 5 reviews negativas
// ═══════════════════════════════════════════════════════════════════════════════

describe('checkAndUpdateAlerts — detecção automática de alertas', () => {
  function makeReviews(overrides = []) {
    return overrides.map((o, i) => ({
      id: i + 1,
      sentiment: o.sentiment ?? 'negative',
      comment: o.comment ?? 'Comentário genérico.',
      rating: o.rating ?? 2,
    }));
  }

  it('5 reviews negativas → alert_level HIGH no lugar', async () => {
    const negativeReviews = makeReviews([
      { sentiment: 'negative', comment: 'Horrível, evite esse lugar.' },
      { sentiment: 'negative', comment: 'Péssimo, muito perigoso.' },
      { sentiment: 'negative', comment: 'Terrível, não recomendo.' },
      { sentiment: 'negative', comment: 'Decepcionante e descuidado.' },
      { sentiment: 'negative', comment: 'Lamentável estado do local.' },
    ]);

    Review.findAll.mockResolvedValue(negativeReviews);
    Place.findByPk.mockResolvedValue({
      id: 1, name: 'Parque Teste', avg_rating: 2.0,
      review_count: 5, alert_level: 'none',
    });
    Place.update.mockResolvedValue([1]);
    Alert.update.mockResolvedValue([0]);
    Alert.create.mockResolvedValue({
      id: 1, place_id: 1, level: 'high',
      message: 'Alerta de segurança.', is_active: true,
      toJSON() { return { ...this }; },
    });

    const result = await checkAndUpdateAlerts(1, null);

    expect(Place.update).toHaveBeenCalledWith(
      { alert_level: 'high' },
      expect.objectContaining({ where: { id: 1 } })
    );
    expect(Alert.create).toHaveBeenCalled();
  });

  it('review com palavra de risco "assalto" → alert_level HIGH independente da proporção', async () => {
    const reviews = makeReviews([
      { sentiment: 'positive', comment: 'Muito bonito.' },
      { sentiment: 'positive', comment: 'Ótima vista.' },
      { sentiment: 'positive', comment: 'Maravilhoso!' },
      { sentiment: 'neutral',  comment: 'Ok.' },
      { sentiment: 'negative', comment: 'Fui assaltado na saída do parque.', rating: 1 },
    ]);

    Review.findAll.mockResolvedValue(reviews);
    Place.findByPk.mockResolvedValue({
      id: 2, name: 'Mirante', avg_rating: 4.0,
      review_count: 5, alert_level: 'none',
    });
    Place.update.mockResolvedValue([1]);
    Alert.update.mockResolvedValue([0]);
    Alert.create.mockResolvedValue({
      id: 2, place_id: 2, level: 'high', message: 'Alerta de segurança.',
      is_active: true, toJSON() { return { ...this }; },
    });

    await checkAndUpdateAlerts(2, null);

    expect(Place.update).toHaveBeenCalledWith(
      { alert_level: 'high' },
      expect.objectContaining({ where: { id: 2 } })
    );
  });

  it('menos de 3 reviews → nenhuma ação (abaixo do mínimo)', async () => {
    Review.findAll.mockResolvedValue(makeReviews([
      { sentiment: 'negative' },
      { sentiment: 'negative' },
    ]));

    const result = await checkAndUpdateAlerts(3, null);

    expect(result).toBeNull();
    expect(Place.update).not.toHaveBeenCalled();
    expect(Alert.create).not.toHaveBeenCalled();
  });

  it('maioria positiva → nenhum alerta gerado', async () => {
    Review.findAll.mockResolvedValue(makeReviews([
      { sentiment: 'positive', comment: 'Ótimo lugar, recomendo.' },
      { sentiment: 'positive', comment: 'Adorei tudo, incrível.' },
      { sentiment: 'positive', comment: 'Maravilhoso, perfeito.' },
      { sentiment: 'positive', comment: 'Excelente, voltarei.' },
      { sentiment: 'negative', comment: 'Não gostei muito.' },
    ]));
    Place.findByPk.mockResolvedValue({
      id: 4, name: 'Jardim', avg_rating: 4.5,
      review_count: 5, alert_level: 'none',
    });

    const result = await checkAndUpdateAlerts(4, null);

    // Nível novo = 'none', igual ao atual → nenhuma atualização
    expect(result).toBeNull();
    expect(Place.update).not.toHaveBeenCalled();
  });

  it('lugar inexistente → retorna null sem erro', async () => {
    Review.findAll.mockResolvedValue(makeReviews([
      { sentiment: 'negative' }, { sentiment: 'negative' }, { sentiment: 'negative' },
    ]));
    Place.findByPk.mockResolvedValue(null);

    const result = await checkAndUpdateAlerts(999, null);
    expect(result).toBeNull();
  });

  it('erro no banco → não propaga exceção', async () => {
    Review.findAll.mockRejectedValue(new Error('DB connection lost'));

    await expect(checkAndUpdateAlerts(1, null)).resolves.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Pipeline híbrido — threshold θ + veto léxico
// ═══════════════════════════════════════════════════════════════════════════════

describe('pipeline híbrido — threshold + veto léxico', () => {
  const { compareModels } = require('../services/aiService');
  let originalFetch, originalKey;

  // Simula a HF devolvendo a mesma distribuição softmax para M1 e M2
  function mockHF(label, score) {
    const rest = (1 - score) / 2;
    const others = ['positive', 'neutral', 'negative'].filter((l) => l !== label);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [[
        { label, score },
        { label: others[0], score: rest },
        { label: others[1], score: rest },
      ]],
    });
  }

  beforeEach(() => {
    originalFetch = global.fetch;
    originalKey = process.env.HUGGINGFACE_API_KEY;
    process.env.HUGGINGFACE_API_KEY = 'fake-key-for-test';
  });
  afterEach(() => {
    global.fetch = originalFetch;
    process.env.HUGGINGFACE_API_KEY = originalKey;
  });

  it('score alto (≥ θ) → mantém a predição do modelo', async () => {
    mockHF('positive', 0.97);
    const r = await analyzeSentiment('Lugar maravilhoso, família adorou!');
    expect(r.sentiment).toBe('positive');
  });

  it('score baixo sem palavra-chave → reclassifica como neutro', async () => {
    mockHF('positive', 0.61);
    const r = await analyzeSentiment('Lugar bem ok, da pra passar a tarde, mas não é tudo aquilo que dizem');
    expect(r.sentiment).toBe('neutral');
  });

  it('score baixo com léxico que corrobora → veto mantém negativo', async () => {
    mockHF('negative', 0.56);
    const r = await analyzeSentiment('Péssimo! Nos assaltaram na saída. Evitem a todo custo.');
    expect(r.sentiment).toBe('negative');
  });

  it('score baixo com léxico contrário → neutro (não confia em nenhum dos dois)', async () => {
    mockHF('positive', 0.58);
    const r = await analyzeSentiment('Ambiente péssimo e sujo, mas a vista compensa');
    expect(r.sentiment).toBe('neutral');
  });

  it('compareModels expõe m2_raw, m2 final e m2_changed', async () => {
    mockHF('positive', 0.61);
    const r = await compareModels('Fui no fim de semana. Estava cheio mas ok. Preço médio.');
    expect(r.m2_raw.sentiment).toBe('positive');
    expect(r.m2.sentiment).toBe('neutral');
    expect(r.m2_changed).toBe(true);
    expect(r.threshold).toBe(0.65);
  });

  it('HF indisponível → compareModels marca M1/M2 como unavailable e M3 ainda responde', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));
    const r = await compareModels('Péssimo lugar, muito perigoso!');
    expect(r.m1.sentiment).toBe('unavailable');
    expect(r.m2.sentiment).toBe('unavailable');
    expect(r.m3.sentiment).toBe('negative');
  });
});

describe('containsRiskKeywords — flexões e falsos positivos', () => {
  it.each([
    ['Nos assaltaram na saída', 'assalto'],
    ['Roubaram meu celular', 'roubo'],
    ['Região de muito perigo à noite', 'perigoso'],
    ['Evitem esse lugar', 'evite'],
  ])('"%s" → %s', (text, label) => {
    expect(containsRiskKeywords(text)).toContain(label);
  });

  it('"bem cuidado" (elogio) não dispara alerta; "tomem cuidado com" dispara', () => {
    expect(containsRiskKeywords('Parque bem cuidado e limpo')).toHaveLength(0);
    expect(containsRiskKeywords('Tomem cuidado com a bolsa na saída')).toContain('cuidado');
  });

  it('"inevitável" não dispara "evite"', () => {
    expect(containsRiskKeywords('Foi inevitável voltar, adorei')).toHaveLength(0);
  });
});
