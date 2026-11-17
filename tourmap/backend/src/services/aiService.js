/**
 * Análise de sentimento das avaliações.
 *
 * Modelo: DistilBERT multilíngue (M2), com pós-processamento híbrido (limiar de
 * confiança + lista de palavras). Se o modelo não estiver disponível, a
 * classificação usa só a lista de palavras (M3).
 *
 * Motor (SENTIMENT_ENGINE):
 *   local (padrão) — modelo em ONNX dentro do backend (transformers.js)
 *   api            — Hugging Face Inference API (exige HUGGINGFACE_API_KEY com créditos)
 *   off            — só a lista de palavras
 *
 * Nunca lança exceção: falha da IA não pode derrubar a requisição.
 */

const HF_BASE = 'https://router.huggingface.co/hf-inference/models';

// hub: modelo original (API) · onnx: mesma rede convertida (motor local)
const MODELS = {
  m1: { hub: 'cardiffnlp/twitter-roberta-base-sentiment-latest',             onnx: 'Xenova/twitter-roberta-base-sentiment-latest' },
  m2: { hub: 'lxyuan/distilbert-base-multilingual-cased-sentiments-student', onnx: 'Xenova/distilbert-base-multilingual-cased-sentiments-student' },
};

const engine = () => process.env.SENTIMENT_ENGINE || 'local';
// fp32 é fiel ao modelo original; q8 é 4x menor mas muda predições limítrofes
const dtype  = () => process.env.SENTIMENT_DTYPE || 'fp32';

// Abaixo desse limiar o modelo é considerado incerto (escolhido por validação cruzada).
const NEUTRAL_THRESHOLD = 0.65;

// ── Lista de palavras (M3) ───────────────────────────────────────────────────
// Usada como classificador de reserva e como "segunda opinião" no híbrido.

const POSITIVE_WORDS = [
  'ótimo', 'excelente', 'maravilhoso', 'incrível', 'lindo', 'linda',
  'recomendo', 'adorei', 'perfeito', 'perfeita', 'fantástico', 'fantástica',
  'espetacular', 'sensacional', 'delicioso', 'deliciosa', 'impecável',
  'encantador', 'encantadora', 'magnífico', 'magnífica', 'top', 'amei',
];

const NEGATIVE_WORDS = [
  'péssimo', 'péssima', 'horrível', 'golpe', 'perigoso', 'perigosa',
  'assalto', 'assaltaram', 'assaltado', 'sujo', 'suja', 'abandonado', 'abandonada',
  'evite', 'evitem', 'terrível', 'decepcionante', 'lamentável', 'revoltante',
  'inadmissível', 'descaso', 'vergonha', 'roubo', 'fraude', 'cuidado',
];

const stripAccents = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const POS_NORM = POSITIVE_WORDS.map(stripAccents);
const NEG_NORM = NEGATIVE_WORDS.map(stripAccents);

function countWords(text) {
  const lower = stripAccents(text);
  return {
    pos: POS_NORM.filter((w) => lower.includes(w)).length,
    neg: NEG_NORM.filter((w) => lower.includes(w)).length,
  };
}

/** Polaridade indicada pela lista: 'positive' | 'negative' | null (sem termos ou empate). */
function lexicalDirection(text) {
  const { pos, neg } = countWords(text);
  if (neg > pos) return 'negative';
  if (pos > neg) return 'positive';
  return null;
}

/** Classificação só pela lista (M3). Não trata negação ("não foi horrível"). */
function analyzeBykeywords(text) {
  const { pos, neg } = countWords(text);
  const total = pos + neg;
  if (neg > pos) return { sentiment: 'negative', score: Math.round((neg / total) * 1000) / 1000 };
  if (pos > neg) return { sentiment: 'positive', score: Math.round((pos / total) * 1000) / 1000 };
  return { sentiment: 'neutral', score: 0.5 };
}

/**
 * Classificação usada em produção: M2 + híbrido; sem modelo, lista de palavras.
 * @returns {{ sentiment: 'positive'|'neutral'|'negative', score: number }}
 */
async function analyzeSentiment(text) {
  if (!text || text.trim().length < 5) return { sentiment: 'neutral', score: 0.5 };

  const raw = await predict('m2', text);
  if (raw) return applyHybrid(text, raw);
  return analyzeBykeywords(text);
}

/**
 * Método híbrido. Mesma função na plataforma, na demo e no script de avaliação.
 *   score >= θ                     → mantém a resposta do modelo
 *   score <  θ e a lista concorda  → mantém
 *   score <  θ e a lista não concorda ou não acha termos → neutro
 */
function applyHybrid(text, raw, threshold = NEUTRAL_THRESHOLD) {
  if (raw.score >= threshold) return raw;
  if (lexicalDirection(text) === raw.sentiment) return raw;
  return { sentiment: 'neutral', score: raw.score };
}

// ── Palavras de risco ────────────────────────────────────────────────────────
// Independentes do modelo: um relato de assalto sempre gera alerta.
// Radical no início da palavra pega as flexões ("assaltaram", "perigo") sem
// casar no meio de outra ("inevitável" não dispara "evite").
const RISK_STEMS = [
  { label: 'golpe',    re: /\bgolpe/ },
  { label: 'assalto',  re: /\bassalt/ },
  { label: 'roubo',    re: /\broub/ },
  { label: 'perigoso', re: /\bperig/ },
  // Só o aviso ("Cuidado!", "tomem cuidado com..."), não o elogio ("parque bem cuidado")
  { label: 'cuidado',  re: /(^|[.!?]\s*)cuidado\b|\bcuidado\s*(!|com\b|ao\b)/ },
  { label: 'fraude',   re: /\bfraud/ },
  { label: 'evite',    re: /\bevit(e|em|ar)\b/ },
];

function containsRiskKeywords(text) {
  const lower = stripAccents(text);
  return RISK_STEMS.filter(({ re }) => re.test(lower)).map(({ label }) => label);
}

/** Os três modelos lado a lado, para a demo (/api/ai/compare). */
async function compareModels(text) {
  if (!text || text.trim().length < 5) {
    const neutral = { sentiment: 'neutral', score: 0.5 };
    return { m1: neutral, m2_raw: neutral, m2: neutral, m3: neutral, threshold: NEUTRAL_THRESHOLD, m2_changed: false };
  }

  const [rawM1, rawM2] = await Promise.all([predict('m1', text), predict('m2', text)]);

  const m1  = rawM1 ?? { sentiment: 'unavailable', score: 0 };
  const m2Raw = rawM2 ?? { sentiment: 'unavailable', score: 0 };

  const m2Final = rawM2 ? applyHybrid(text, m2Raw) : m2Raw;

  const m3 = analyzeBykeywords(text);

  return {
    m1,
    m2_raw:    m2Raw,
    m2:        m2Final,
    m3,
    threshold: NEUTRAL_THRESHOLD,
    m2_changed: m2Raw.sentiment !== m2Final.sentiment,
  };
}

// ── Camada de modelos ────────────────────────────────────────────────────────

/**
 * predict — argmax do modelo, sem pós-processamento. null se indisponível.
 * @param {'m1'|'m2'} key
 */
async function predict(key, text) {
  switch (engine()) {
    case 'off':
      return null;
    case 'api': {
      const apiKey = process.env.HUGGINGFACE_API_KEY;
      return apiKey ? callHF(`${HF_BASE}/${MODELS[key].hub}`, text, apiKey) : null;
    }
    default:
      return localPredict(key, text);
  }
}

// Um pipeline por modelo, carregado sob demanda e reaproveitado entre chamadas.
// Em produção só o M2 é carregado; o M1 só sobe se alguém usar a demo.
const pipelines = {};

function loadLocal(key) {
  if (!pipelines[key]) {
    pipelines[key] = (async () => {
      const t0 = Date.now();
      const { pipeline, env } = await import('@huggingface/transformers');
      // Fora de node_modules: sobrevive a reinstalações (no Docker, é um volume)
      env.cacheDir = process.env.MODEL_CACHE_DIR || require('path').join(__dirname, '../../.model-cache');
      const clf = await pipeline('text-classification', MODELS[key].onnx, { dtype: dtype() });
      console.log(`[AI] Modelo ${key} (${MODELS[key].onnx}, ${dtype()}) carregado em ${Date.now() - t0} ms`);
      return clf;
    })().catch((err) => {
      delete pipelines[key]; // permite nova tentativa na próxima chamada
      throw err;
    });
  }
  return pipelines[key];
}

async function localPredict(key, text) {
  try {
    const clf = await loadLocal(key);
    const [best] = await clf(text.slice(0, 512), { top_k: 1 });
    return { sentiment: normalizeLabel(best.label), score: Math.round(best.score * 1000) / 1000 };
  } catch (err) {
    console.warn(`[AI] Modelo local ${key} indisponível: ${err.message}`);
    return null;
  }
}

/** Probabilidade das três classes (scripts de avaliação). Lança erro se o modelo não carregar. */
async function localProbabilities(key, text) {
  const clf = await loadLocal(key);
  const all = await clf(text.slice(0, 512), { top_k: null });
  const out = { positive: 0, neutral: 0, negative: 0 };
  for (const { label, score } of all) out[normalizeLabel(label)] = score;
  return out;
}

function normalizeLabel(label) {
  const l = String(label).toLowerCase();
  const map = { label_0: 'negative', label_1: 'neutral', label_2: 'positive' };
  const out = map[l] || l;
  return ['positive', 'neutral', 'negative'].includes(out) ? out : 'neutral';
}

/** Pré-carrega o M2 no boot para a primeira review não esperar o carregamento. */
function warmupModels() {
  if (engine() !== 'local') return;
  loadLocal('m2').catch((err) => console.warn('[AI] Pré-carregamento do M2 falhou:', err.message));
}

/** Descrição do motor atual, exposta na demo. */
function engineInfo() {
  return { engine: engine(), dtype: engine() === 'local' ? dtype() : null };
}

// Chamada à HF Inference API. Tenta duas vezes: a API responde 503 enquanto o
// modelo carrega (cold start).
async function callHF(url, text, apiKey) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: text.slice(0, 512), options: { wait_for_model: true } }),
        signal: AbortSignal.timeout(20000), // 20s para dar tempo ao cold start
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 503 && body.estimated_time && attempt === 0) {
          const wait = Math.min(body.estimated_time * 1000, 12000);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        return null;
      }
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const best = data[0].reduce((a, b) => (a.score > b.score ? a : b));
        return { sentiment: normalizeLabel(best.label), score: Math.round(best.score * 1000) / 1000 };
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

module.exports = {
  analyzeSentiment,
  compareModels,
  containsRiskKeywords,
  warmupModels,
  engineInfo,
  // usados pelo script de avaliação
  applyHybrid,
  analyzeBykeywords,
  predict,
  localProbabilities,
  MODELS,
  NEUTRAL_THRESHOLD,
};
