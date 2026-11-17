/**
 * Exporta os dados para os gráficos do artigo (boxplot e curva ROC) e as
 * estatísticas que os acompanham (AUC, intervalos de confiança, teste de McNemar).
 *
 * Diferente de evaluate-sentiment.js, guarda a distribuição de probabilidade
 * COMPLETA de cada modelo (positivo, neutro, negativo), que a curva ROC exige.
 *
 * Uso:  node scripts/export-chart-data.js
 * Saída: backend/scripts/dados-graficos/ (CSV com ";" e vírgula decimal, abre direto no Excel/Sheets)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
process.env.SENTIMENT_ENGINE = 'local';
process.env.SENTIMENT_DTYPE = process.env.SENTIMENT_DTYPE || 'fp32';

const fs = require('fs');
const path = require('path');
const { SET_A, SET_B } = require('./sentiment-datasets');
const { localProbabilities, applyHybrid, NEUTRAL_THRESHOLD } = require('../src/services/aiService');

const OUT = path.join(__dirname, 'dados-graficos');
const CLASSES = ['positive', 'neutral', 'negative'];
const PT = { positive: 'positivo', neutral: 'neutro', negative: 'negativo' };
const MODELS = ['M3', 'M1', 'M2'];
const MODEL_NAMES = { M3: 'M3 Lista de palavras', M1: 'M1 RoBERTa (inglês)', M2: 'M2 DistilBERT multilíngue', HIB: 'Híbrido (M2 + θ + veto)' };

// ── M3 como pontuação ─────────────────────────────────────────────────────────
// A lista de palavras não produz probabilidades. Para entrar na curva ROC, cada
// classe recebe uma pontuação ordinal a partir da contagem de termos:
//   positivo = pos / (pos + neg + 1)   negativo = neg / (pos + neg + 1)
//   neutro   = 1 / (pos + neg + 1)
// Soma 1 e preserva a regra de decisão do M3 (empate ou nenhum termo → neutro).
const src = fs.readFileSync(path.join(__dirname, '../src/services/aiService.js'), 'utf8');
const listOf = (name) => src.split(`const ${name} = [`)[1].split('];')[0].match(/'[^']+'/g).map((w) => w.slice(1, -1));
const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const POS = listOf('POSITIVE_WORDS').map(norm);
const NEG = listOf('NEGATIVE_WORDS').map(norm);

function lexicon(text) {
  const t = norm(text);
  const pos = POS.filter((w) => t.includes(w));
  const neg = NEG.filter((w) => t.includes(w));
  const d = pos.length + neg.length + 1;
  const probs = { positive: pos.length / d, neutral: 1 / d, negative: neg.length / d };
  const pred = neg.length > pos.length ? 'negative' : pos.length > neg.length ? 'positive' : 'neutral';
  return { probs, pred, pos, neg };
}

const argmax = (p) => CLASSES.reduce((a, b) => (p[b] > p[a] ? b : a));

// ── Métricas ─────────────────────────────────────────────────────────────────

function macroF1(pred, gold) {
  return CLASSES.reduce((sum, c) => {
    const tp = pred.filter((p, i) => p === c && gold[i] === c).length;
    const fp = pred.filter((p, i) => p === c && gold[i] !== c).length;
    const fn = pred.filter((p, i) => p !== c && gold[i] === c).length;
    const prec = tp + fp ? tp / (tp + fp) : 0;
    const rec = tp + fn ? tp / (tp + fn) : 0;
    return sum + (prec + rec ? (2 * prec * rec) / (prec + rec) : 0);
  }, 0) / CLASSES.length;
}

// Curva ROC um-contra-todos de uma classe: varre todos os limiares distintos.
function rocCurve(scores, positives) {
  const P = positives.filter(Boolean).length;
  const N = positives.length - P;
  const thresholds = [Infinity, ...[...new Set(scores)].sort((a, b) => b - a)];
  const pts = thresholds.map((t) => {
    let tp = 0, fp = 0;
    scores.forEach((s, i) => { if (s >= t) positives[i] ? tp++ : fp++; });
    return { threshold: t, fpr: fp / N, tpr: tp / P };
  });
  // AUC = probabilidade de um positivo receber pontuação maior que um negativo (empate conta 1/2)
  let wins = 0;
  scores.forEach((sp, i) => {
    if (!positives[i]) return;
    scores.forEach((sn, j) => {
      if (positives[j]) return;
      wins += sp > sn ? 1 : sp === sn ? 0.5 : 0;
    });
  });
  return { points: pts, auc: wins / (P * N) };
}

function fiveNumbers(values) {
  const v = [...values].sort((a, b) => a - b);
  const q = (p) => {
    const pos = (v.length - 1) * p;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return v[lo] + (v[hi] - v[lo]) * (pos - lo);
  };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return { n: v.length, min: v[0], q1: q(0.25), mediana: q(0.5), q3: q(0.75), max: v[v.length - 1], media: mean };
}

// Gerador pseudoaleatório com semente fixa: os intervalos se reproduzem igual sempre
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Bootstrap percentil (Efron & Tibshirani, 1993): reamostra as frases com reposição
function bootstrap(rows, statFn, B = 5000, seed = 42) {
  const rnd = mulberry32(seed);
  const stats = [];
  for (let b = 0; b < B; b++) {
    const sample = rows.map(() => rows[Math.floor(rnd() * rows.length)]);
    stats.push(statFn(sample));
  }
  stats.sort((a, b) => a - b);
  return { ic95_inf: stats[Math.floor(0.025 * B)], ic95_sup: stats[Math.floor(0.975 * B)] };
}

// McNemar exato (binomial bilateral) sobre as frases em que os dois métodos discordam
function mcnemar(correctA, correctB) {
  let b = 0, c = 0;
  correctA.forEach((a, i) => { if (a && !correctB[i]) b++; if (!a && correctB[i]) c++; });
  const n = b + c, k = Math.min(b, c);
  let p = 0;
  const comb = (nn, kk) => { let r = 1; for (let i = 1; i <= kk; i++) r = (r * (nn - kk + i)) / i; return r; };
  for (let i = 0; i <= k; i++) p += comb(n, i) * 0.5 ** n;
  return { so_A_acerta: b, so_B_acerta: c, p_valor: Math.min(1, 2 * p) };
}

// ── Formatação CSV (padrão brasileiro: ";" e vírgula decimal) ─────────────────

const cell = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6).replace('.', ',') : '';
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const writeCsv = (file, header, rows) => fs.writeFileSync(
  path.join(OUT, file),
  '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\n') + '\n',
);

// ── Execução ─────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const all = [
    ...SET_A.map(([text, label], i) => ({ id: i + 1, set: 'A', text, label })),
    ...SET_B.map(([text, label], i) => ({ id: i + 31, set: 'B', text, label })),
  ];

  process.stdout.write('Rodando M1 e M2 nas 60 frases ');
  for (const r of all) {
    r.M1 = await localProbabilities('m1', r.text);
    r.M2 = await localProbabilities('m2', r.text);
    const lex = lexicon(r.text);
    r.M3 = lex.probs;
    r.pred = { M1: argmax(r.M1), M2: argmax(r.M2), M3: lex.pred };
    const m2best = r.pred.M2;
    r.pred.HIB = applyHybrid(r.text, { sentiment: m2best, score: r.M2[m2best] }, NEUTRAL_THRESHOLD).sentiment;
    r.lex = lex;
    r.words = r.text.split(/\s+/).filter(Boolean).length;
    process.stdout.write('.');
  }
  console.log();

  // 1) Frases e probabilidades (uma linha por frase)
  writeCsv('probabilidades.csv',
    ['id', 'conjunto', 'texto', 'rotulo', 'palavras', 'termos_lista_pos', 'termos_lista_neg',
      ...MODELS.flatMap((m) => [`${m}_p_positivo`, `${m}_p_neutro`, `${m}_p_negativo`, `${m}_previsto`]),
      'HIB_previsto', ...['M3', 'M1', 'M2', 'HIB'].map((m) => `${m}_acertou`)],
    all.map((r) => [r.id, r.set, r.text, PT[r.label], r.words, r.lex.pos.join(' '), r.lex.neg.join(' '),
      ...MODELS.flatMap((m) => [r[m].positive, r[m].neutral, r[m].negative, PT[r.pred[m]]]),
      PT[r.pred.HIB], ...['M3', 'M1', 'M2', 'HIB'].map((m) => (r.pred[m] === r.label ? 1 : 0))]));

  // 2) Boxplot: formato longo (uma linha por frase × modelo)
  const boxRows = [];
  for (const r of all) for (const m of MODELS) {
    boxRows.push([MODEL_NAMES[m], r.set, PT[r.label], r[m][r.label], Math.max(...CLASSES.map((c) => r[m][c])), r.pred[m] === r.label ? 'acertou' : 'errou']);
  }
  writeCsv('boxplot.csv', ['modelo', 'conjunto', 'rotulo_correto', 'prob_classe_correta', 'confianca_resposta', 'resultado'], boxRows);

  // 3) Curvas ROC (um-contra-todos) por modelo, conjunto e classe
  const scopes = { B: all.filter((r) => r.set === 'B'), 'A+B': all, A: all.filter((r) => r.set === 'A') };
  const rocRows = [];
  const auc = {};
  const opPoints = [];
  for (const [scope, rows] of Object.entries(scopes)) {
    auc[scope] = {};
    for (const m of MODELS) {
      auc[scope][m] = {};
      for (const c of CLASSES) {
        const { points, auc: a } = rocCurve(rows.map((r) => r[m][c]), rows.map((r) => r.label === c));
        auc[scope][m][c] = a;
        points.forEach((p) => rocRows.push([MODEL_NAMES[m], scope, PT[c], Number.isFinite(p.threshold) ? p.threshold : '', p.fpr, p.tpr]));
      }
      auc[scope][m].macro = CLASSES.reduce((s, c) => s + auc[scope][m][c], 0) / 3;
    }
    // Pontos de operação: a decisão final de cada método (um ponto por classe)
    for (const m of [...MODELS, 'HIB']) for (const c of CLASSES) {
      const P = rows.filter((r) => r.label === c).length, N = rows.length - P;
      const tp = rows.filter((r) => r.pred[m] === c && r.label === c).length;
      const fp = rows.filter((r) => r.pred[m] === c && r.label !== c).length;
      opPoints.push([MODEL_NAMES[m], scope, PT[c], fp / N, tp / P]);
    }
  }
  writeCsv('roc.csv', ['modelo', 'conjunto', 'classe', 'limiar', 'fpr', 'tpr'], rocRows);
  writeCsv('roc_pontos_decisao.csv', ['modelo', 'conjunto', 'classe', 'fpr', 'tpr'], opPoints);

  // 4) Estatísticas
  const f1 = (rows, m) => macroF1(rows.map((r) => r.pred[m]), rows.map((r) => r.label));
  const stats = { threshold: NEUTRAL_THRESHOLD, gerado_em: new Date().toISOString(), auc, f1_macro: {}, diferencas: {}, mcnemar: {}, boxplot: {}, dados: {} };
  for (const [scope, rows] of Object.entries(scopes)) {
    stats.f1_macro[scope] = {};
    for (const m of [...MODELS, 'HIB']) stats.f1_macro[scope][m] = { valor: f1(rows, m), ...bootstrap(rows, (s) => f1(s, m)) };
    stats.diferencas[scope] = {
      'M2 - M3': { valor: f1(rows, 'M2') - f1(rows, 'M3'), ...bootstrap(rows, (s) => f1(s, 'M2') - f1(s, 'M3')) },
      'M2 - M1': { valor: f1(rows, 'M2') - f1(rows, 'M1'), ...bootstrap(rows, (s) => f1(s, 'M2') - f1(s, 'M1')) },
      'HIB - M2': { valor: f1(rows, 'HIB') - f1(rows, 'M2'), ...bootstrap(rows, (s) => f1(s, 'HIB') - f1(s, 'M2')) },
    };
    const ok = (m) => rows.map((r) => r.pred[m] === r.label);
    stats.mcnemar[scope] = {
      'M2 vs M3': mcnemar(ok('M2'), ok('M3')),
      'M2 vs M1': mcnemar(ok('M2'), ok('M1')),
      'HIB vs M2': mcnemar(ok('HIB'), ok('M2')),
    };
    stats.boxplot[scope] = {};
    for (const m of MODELS) {
      stats.boxplot[scope][m] = {
        prob_classe_correta: fiveNumbers(rows.map((r) => r[m][r.label])),
        confianca_quando_acerta: rows.some((r) => r.pred[m] === r.label) ? fiveNumbers(rows.filter((r) => r.pred[m] === r.label).map((r) => Math.max(...CLASSES.map((c) => r[m][c])))) : null,
        confianca_quando_erra: rows.some((r) => r.pred[m] !== r.label) ? fiveNumbers(rows.filter((r) => r.pred[m] !== r.label).map((r) => Math.max(...CLASSES.map((c) => r[m][c])))) : null,
      };
    }
  }
  // Descrição dos conjuntos
  for (const s of ['A', 'B']) {
    const rows = scopes[s];
    stats.dados[s] = {
      frases: rows.length,
      por_classe: Object.fromEntries(CLASSES.map((c) => [PT[c], rows.filter((r) => r.label === c).length])),
      palavras_por_frase: fiveNumbers(rows.map((r) => r.words)),
      frases_com_termo_da_lista: rows.filter((r) => r.lex.pos.length + r.lex.neg.length > 0).length,
      polares_com_termo_da_lista: rows.filter((r) => r.label !== 'neutral' && r.lex.pos.length + r.lex.neg.length > 0).length,
    };
  }
  fs.writeFileSync(path.join(OUT, 'estatisticas.json'), JSON.stringify(stats, null, 2));

  // Resumo no terminal
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  console.log('\nAUC macro (um-contra-todos):');
  for (const s of ['B', 'A+B']) console.log(`  ${s.padEnd(4)} ` + MODELS.map((m) => `${m} ${auc[s][m].macro.toFixed(3)}`).join('  '));
  console.log('\nF1 macro com IC 95% (bootstrap, 5000 reamostragens):');
  for (const s of ['B', 'A+B']) for (const m of [...MODELS, 'HIB']) {
    const v = stats.f1_macro[s][m];
    console.log(`  ${s.padEnd(4)} ${m.padEnd(4)} ${pct(v.valor)}  [${pct(v.ic95_inf)} – ${pct(v.ic95_sup)}]`);
  }
  console.log('\nDiferenças de F1 (IC 95%):');
  for (const s of ['B', 'A+B']) for (const [k, v] of Object.entries(stats.diferencas[s])) {
    console.log(`  ${s.padEnd(4)} ${k.padEnd(9)} ${(v.valor * 100).toFixed(1)} p.p.  [${(v.ic95_inf * 100).toFixed(1)} – ${(v.ic95_sup * 100).toFixed(1)}]`);
  }
  console.log('\nMcNemar (p-valor exato):');
  for (const s of ['B', 'A+B']) for (const [k, v] of Object.entries(stats.mcnemar[s])) {
    console.log(`  ${s.padEnd(4)} ${k.padEnd(10)} só o 1º acerta ${v.so_A_acerta}, só o 2º acerta ${v.so_B_acerta}, p = ${v.p_valor.toFixed(4)}`);
  }
  console.log('\nDados:', JSON.stringify(stats.dados));
  console.log(`\nArquivos em ${path.relative(process.cwd(), OUT)}/`);
}

main().catch((err) => { console.error(err); process.exit(1); });
