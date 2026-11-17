/**
 * Avaliação comparativa de análise de sentimento
 *
 * Compara as abordagens nas mesmas frases rotuladas (scripts/sentiment-datasets.js).
 *
 * Configurações avaliadas (todas usam o código de produção de aiService.js):
 *   M3          Palavras-chave PT-BR (sem IA)
 *   M1          RoBERTa-base (inglês)                  — argmax puro
 *   M2          DistilBERT multilingual                — argmax puro
 *   M2+θ        DistilBERT + threshold simples
 *   M2+híbrido  DistilBERT + threshold + veto léxico (produção)
 *   M1+híbrido  RoBERTa + threshold + veto léxico      — controle: o ganho depende do modelo?
 *
 * Dois conjuntos de dados:
 *   A (desenvolvimento) — 30 frases usadas durante o desenvolvimento. O léxico do M3
 *                         foi escrito olhando para elas, então M3 e híbrido ficam otimistas.
 *   B (validação)       — 30 frases novas, escritas depois do léxico; nenhum método
 *                         foi ajustado nelas. Mede generalização.
 *
 * Também mede latência por chamada e calibra θ com varredura + validação cruzada
 * (5 partes, 60 frases): por isso o híbrido no B não é medição independente.
 *
 * Uso:
 *   node scripts/evaluate-sentiment.js               # modelos locais ONNX fp32 (padrão)
 *   node scripts/evaluate-sentiment.js --dtype q8    # versão quantizada (4x menor)
 *   node scripts/evaluate-sentiment.js --engine api  # HF Inference API (exige créditos)
 *   node scripts/evaluate-sentiment.js --offline     # recalcula a partir do último JSON salvo
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs   = require('fs');
const path = require('path');

// Flags precisam valer antes de o aiService ler o ambiente
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
if (arg('--engine')) process.env.SENTIMENT_ENGINE = arg('--engine');
if (arg('--dtype'))  process.env.SENTIMENT_DTYPE  = arg('--dtype');

const {
  applyHybrid, analyzeBykeywords, predict, engineInfo, MODELS, NEUTRAL_THRESHOLD,
} = require('../src/services/aiService');

const MODEL_KEYS = { M1: 'm1', M2: 'm2' };
const ENGINE     = engineInfo();
const SUFFIX     = ENGINE.engine === 'local' && ENGINE.dtype === 'fp32'
  ? '' : `-${ENGINE.engine}${ENGINE.dtype ? '-' + ENGINE.dtype : ''}`;
const OUT_FILE   = path.join(__dirname, `sentiment-evaluation${SUFFIX}.json`);
const CLASSES  = ['positive', 'neutral', 'negative'];

const { SET_A, SET_B } = require('./sentiment-datasets');

// ── Métricas ──────────────────────────────────────────────────────────────────

function metrics(pred, gold) {
  const per = {};
  for (const c of CLASSES) {
    const tp = pred.filter((p, i) => p === c && gold[i] === c).length;
    const fp = pred.filter((p, i) => p === c && gold[i] !== c).length;
    const fn = pred.filter((p, i) => p !== c && gold[i] === c).length;
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall    = tp + fn ? tp / (tp + fn) : 0;
    const f1        = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    per[c] = { tp, fp, fn, precision, recall, f1 };
  }
  const avg = (k) => CLASSES.reduce((s, c) => s + per[c][k], 0) / CLASSES.length;
  // Matriz de confusão: linhas = rótulo real, colunas = previsto
  const confusion = Object.fromEntries(CLASSES.map((g) => [
    g, Object.fromEntries(CLASSES.map((p) => [p, pred.filter((x, i) => gold[i] === g && x === p).length])),
  ]));
  return {
    accuracy: pred.filter((p, i) => p === gold[i]).length / gold.length,
    macroP: avg('precision'), macroR: avg('recall'), macroF1: avg('f1'),
    perClass: per, confusion,
  };
}

function latencyStats(ms) {
  const s = [...ms].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { mean: s.reduce((a, b) => a + b, 0) / s.length, p50: q(0.5), p95: q(0.95), max: s[s.length - 1] };
}

const pct = (v) => `${(v * 100).toFixed(1)}%`;
const ms  = (v) => `${v < 1 ? v.toFixed(3) : v.toFixed(0)} ms`;

// ── Coleta (API) ──────────────────────────────────────────────────────────────

async function collect(set) {
  const rows = [];
  for (const [text, label] of set) {
    const row = { text, label };
    for (const [key, model] of Object.entries(MODEL_KEYS)) {
      const t0  = performance.now();
      const raw = await predict(model, text);
      row[key]  = { raw, latency_ms: performance.now() - t0 };
    }
    const t0 = performance.now();
    row.M3 = { raw: analyzeBykeywords(text), latency_ms: performance.now() - t0 };
    rows.push(row);
    process.stdout.write(row.M1.raw && row.M2.raw ? '.' : 'x');
  }
  return rows;
}

// ── Configurações avaliadas ───────────────────────────────────────────────────

const UNAVAILABLE = 'unavailable';
const sentimentOf = (r) => (r ? r.sentiment : UNAVAILABLE);

const CONFIGS = {
  'M3 Palavras-chave':      (row)    => row.M3.raw.sentiment,
  'M1 RoBERTa':             (row)    => sentimentOf(row.M1.raw),
  'M2 DistilBERT':          (row)    => sentimentOf(row.M2.raw),
  'M2 + θ simples':         (row, θ) => (!row.M2.raw ? UNAVAILABLE : row.M2.raw.score < θ ? 'neutral' : row.M2.raw.sentiment),
  'M2 + híbrido (produção)':(row, θ) => (!row.M2.raw ? UNAVAILABLE : applyHybrid(row.text, row.M2.raw, θ).sentiment),
  'M1 + híbrido (controle)':(row, θ) => (!row.M1.raw ? UNAVAILABLE : applyHybrid(row.text, row.M1.raw, θ).sentiment),
};

function evaluate(rows, θ = NEUTRAL_THRESHOLD) {
  const gold = rows.map((r) => r.label);
  return Object.fromEntries(Object.entries(CONFIGS).map(([name, fn]) => {
    const pred = rows.map((r) => fn(r, θ));
    return [name, { ...metrics(pred, gold), pred }];
  }));
}

// Varre θ e devolve macro-F1 de cada pós-processamento do M2
function sweep(rows) {
  const out = [];
  for (let θ = 0.40; θ <= 0.951; θ += 0.05) {
    const r = evaluate(rows, θ);
    out.push({
      theta: Number(θ.toFixed(2)),
      simple: r['M2 + θ simples'].macroF1,
      hybrid: r['M2 + híbrido (produção)'].macroF1,
    });
  }
  return out;
}

// Validação cruzada k-fold estratificada: escolhe θ no treino, mede no teste.
// Evita reportar um θ "escolhido olhando a resposta".
function crossValidateTheta(rows, k = 5) {
  const byClass = CLASSES.map((c) => rows.filter((r) => r.label === c));
  const folds = Array.from({ length: k }, () => []);
  byClass.forEach((list) => list.forEach((r, i) => folds[i % k].push(r)));

  const preds = new Map();
  const chosen = [];
  folds.forEach((test, i) => {
    const train = folds.filter((_, j) => j !== i).flat();
    const best = sweep(train).reduce((a, b) => (b.hybrid > a.hybrid ? b : a));
    chosen.push(best.theta);
    test.forEach((r) => preds.set(r, CONFIGS['M2 + híbrido (produção)'](r, best.theta)));
  });
  const ordered = rows.map((r) => preds.get(r));
  return { chosen_thetas: chosen, ...metrics(ordered, rows.map((r) => r.label)) };
}

// ── Relatório ─────────────────────────────────────────────────────────────────

function report(title, rows) {
  const res = evaluate(rows);
  console.log(`\n\n══ ${title} ${'═'.repeat(Math.max(0, 60 - title.length))}`);
  console.log('Configuração'.padEnd(27) + 'Acurácia'.padEnd(10) + 'Precisão'.padEnd(10) + 'Recall'.padEnd(10) + 'F1 macro'.padEnd(10) + 'F1 neutro');
  console.log('─'.repeat(77));
  for (const [name, m] of Object.entries(res)) {
    console.log(name.padEnd(27) + pct(m.accuracy).padEnd(10) + pct(m.macroP).padEnd(10) +
      pct(m.macroR).padEnd(10) + pct(m.macroF1).padEnd(10) + pct(m.perClass.neutral.f1));
  }

  console.log('\n  Erros do M2 + híbrido (produção):');
  const prod = res['M2 + híbrido (produção)'].pred;
  rows.forEach((r, i) => {
    if (prod[i] !== r.label) {
      console.log(`    esperado ${r.label.padEnd(8)} previsto ${prod[i].padEnd(8)} ` +
        `(M2 bruto ${sentimentOf(r.M2.raw)} ${r.M2.raw ? pct(r.M2.raw.score) : ''})  "${r.text.slice(0, 55)}…"`);
    }
  });
  return res;
}

async function main() {
  const offline = process.argv.includes('--offline');
  let data;

  if (offline) {
    if (!fs.existsSync(OUT_FILE)) throw new Error(`${OUT_FILE} não existe — rode sem --offline primeiro.`);
    data = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')).raw;
  } else {
    console.log(`Motor: ${ENGINE.engine}${ENGINE.dtype ? ` (${ENGINE.dtype})` : ''}`);
    // Aquece os modelos para a latência medida não incluir carregamento / cold start
    process.stdout.write('Carregando modelos');
    for (const model of Object.values(MODEL_KEYS)) await predict(model, 'aquecimento dos modelos');
    process.stdout.write('\nConjunto A ');
    const A = await collect(SET_A);
    process.stdout.write('\nConjunto B ');
    const B = await collect(SET_B);
    data = { A, B, collected_at: new Date().toISOString() };
  }

  const failures = ['A', 'B'].flatMap((k) => data[k]).filter((r) => !r.M1.raw || !r.M2.raw).length;
  if (failures) console.warn(`\n⚠ ${failures} predições falharam (marcadas como unavailable e contadas como erro).`);

  const resA = report('Conjunto A — desenvolvimento (léxico ajustado nele)', data.A);
  const resB = report('Conjunto B — validação (dados novos)', data.B);
  const all  = [...data.A, ...data.B];
  const resAll = report('A + B — 60 frases', all);

  console.log('\n\n══ Calibração de θ (M2, conjuntos A+B) ═════════════════════════');
  console.log('   θ     θ simples   híbrido');
  const sw = sweep(all);
  sw.forEach((s) => console.log(`  ${s.theta.toFixed(2)}   ${pct(s.simple).padEnd(10)}  ${pct(s.hybrid)}${s.theta === NEUTRAL_THRESHOLD ? '   ← produção' : ''}`));

  const cv = crossValidateTheta(all);
  console.log(`\n  Validação cruzada 5-fold (θ escolhido no treino de cada fold): ${cv.chosen_thetas.join(', ')}`);
  console.log(`  F1 macro honesto do híbrido: ${pct(cv.macroF1)}  (acurácia ${pct(cv.accuracy)})`);

  console.log('\n\n══ Latência por chamada (A+B) ══════════════════════════════════');
  const lat = Object.fromEntries(['M1', 'M2', 'M3'].map((k) => [k, latencyStats(all.map((r) => r[k].latency_ms))]));
  for (const [k, l] of Object.entries(lat)) {
    console.log(`  ${k}  média ${ms(l.mean).padEnd(10)} p50 ${ms(l.p50).padEnd(10)} p95 ${ms(l.p95).padEnd(10)} máx ${ms(l.max)}`);
  }

  const strip = (res) => Object.fromEntries(Object.entries(res).map(([k, { pred, ...m }]) => [k, m]));
  fs.writeFileSync(OUT_FILE, JSON.stringify({
    generated_at: new Date().toISOString(),
    threshold: NEUTRAL_THRESHOLD,
    engine: ENGINE,
    models: MODELS,
    results: { A: strip(resA), B: strip(resB), all: strip(resAll) },
    theta_sweep: sw,
    cross_validation: cv,
    latency_ms: lat,
    raw: data,
  }, null, 2));
  console.log(`\nResultados salvos em ${path.relative(process.cwd(), OUT_FILE)}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
