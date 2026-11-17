import { useState, useRef } from 'react';
import { Brain, Zap, AlertTriangle } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const SENTIMENT_META = {
  positive:    { label: 'Positivo',     colorVar: 'var(--success)',  bgVar: 'var(--success-light)',  border: '#6EE7B7' },
  neutral:     { label: 'Neutro',       colorVar: 'var(--warning)',  bgVar: 'var(--warning-light)',  border: '#FCD34D' },
  negative:    { label: 'Negativo',     colorVar: 'var(--danger)',   bgVar: 'var(--danger-light)',   border: '#FCA5A5' },
  unavailable: { label: 'Indisponível', colorVar: 'var(--gray-400)', bgVar: 'var(--gray-100)',       border: 'var(--gray-200)' },
};

const MODELS = [
  {
    key:      'm3',
    tag:      'M3 · Baseline',
    title:    'Palavras-chave',
    subtitle: 'Léxico heurístico PT-BR · sem rede neural · 0 parâmetros',
    tagColor: 'var(--gray-500)',
  },
  {
    key:      'm1',
    tag:      'M1 · Anterior',
    title:    'RoBERTa-base',
    subtitle: '125M parâmetros · 12 camadas · treinado apenas em inglês (tweets)',
    tagColor: 'var(--info)',
  },
  {
    key:      'm2_raw',
    tag:      'M2 · Sem limiar',
    title:    'DistilBERT (bruto)',
    subtitle: '134M parâmetros · 6 camadas · multilíngue · sem pós-processamento',
    tagColor: '#8B5CF6',
  },
  {
    key:        'm2',
    tag:        'M2 · θ = 0,65',
    title:      'DistilBERT + Threshold',
    subtitle:   '134M parâmetros · 6 camadas · multilíngue · com pós-processamento híbrido',
    tagColor:   'var(--primary)',
    production: true,
  },
];

const EXAMPLES = [
  { label: 'Positivo',  text: 'Lugar maravilhoso, família adorou, voltaremos com certeza. Atendimento impecável e preço justo.' },
  { label: 'Negativo',  text: 'Péssimo! Nos assaltaram na saída. Segurança inexistente. Evitem a todo custo.' },
  { label: 'Neutro',    text: 'Fui no fim de semana. Estava cheio mas ok. Preço médio, nada especial.' },
  { label: 'Neutro',    text: 'Evento comum, não foi nem bom nem ruim. Cumpriu o que prometeu.' },
  { label: 'Positivo',  text: 'Museu incrível, curadoria impecável e visita guiada muito enriquecedora.' },
  { label: 'Negativo',  text: 'Golpe completo! Pagamos caro e não entregaram o que prometeram. Fraude!' },
];

const EXAMPLE_COLORS = { Positivo: 'var(--success)', Negativo: 'var(--danger)', Neutro: 'var(--warning)' };

function SentimentBadge({ sentiment }) {
  const meta = SENTIMENT_META[sentiment] ?? SENTIMENT_META.unavailable;
  return (
    <span className="ai-demo__sentiment-badge" style={{ color: meta.colorVar, background: meta.bgVar, borderColor: meta.border }}>
      {meta.label}
    </span>
  );
}

function ConfidenceBar({ score, sentiment }) {
  const meta  = SENTIMENT_META[sentiment] ?? SENTIMENT_META.unavailable;
  const pct   = score > 0 ? Math.round(score * 100) : 0;
  return (
    <div className="ai-demo__conf">
      <div className="ai-demo__conf-row">
        <span className="ai-demo__conf-label">Confiança</span>
        <span className="ai-demo__conf-value" style={{ color: meta.colorVar }}>{score > 0 ? `${pct}%` : '—'}</span>
      </div>
      <div className="ai-demo__track">
        <div className="ai-demo__fill" style={{ width: `${pct}%`, background: meta.colorVar }} />
        {/* marcador do threshold em 55% */}
        <div className="ai-demo__theta" />
      </div>
      <span className="ai-demo__theta-label">θ</span>
    </div>
  );
}

function ModelCard({ model, result, thresholdApplied }) {
  return (
    <div className={`ai-demo__card${model.production ? ' ai-demo__card--production' : ''}`}>
      {model.production && (
        <span className="ai-demo__prod-badge">Em produção</span>
      )}

      <div className="ai-demo__card-tag" style={{ color: model.tagColor, background: `color-mix(in srgb, ${model.tagColor} 12%, white)` }}>
        {model.tag}
      </div>
      <div className="ai-demo__card-title">{model.title}</div>
      <div className="ai-demo__card-sub">{model.subtitle}</div>

      {result ? (
        <>
          <SentimentBadge sentiment={result.sentiment} />
          <ConfidenceBar score={result.score ?? 0} sentiment={result.sentiment} />
          {thresholdApplied && (
            <div className="ai-demo__threshold-note">
              <Zap size={12} />
              Confiança {Math.round(result.score * 100)}% &lt; 65% — reclassificado como neutro
            </div>
          )}
        </>
      ) : (
        <div className="ai-demo__card-empty">Aguardando análise…</div>
      )}
    </div>
  );
}

export default function AIDemo() {
  const [text, setText]       = useState('');
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const textRef = useRef(null);

  async function analyze() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res  = await fetch(`${API_BASE}/ai/compare`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro na análise');
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function fillExample(t) {
    setText(t);
    setResult(null);
    setError('');
    textRef.current?.focus();
  }

  // Monta o insight automático baseado nos resultados
  function buildInsight() {
    if (!result) return null;
    const parts = [];
    const m1Ok = result.m1?.sentiment && result.m1.sentiment !== 'unavailable';
    const m2Ok = result.m2?.sentiment && result.m2.sentiment !== 'unavailable';

    if (result.engine === 'off') {
      parts.push({ icon: <AlertTriangle size={14} />, text: 'Modelos neurais desativados (SENTIMENT_ENGINE=off) — apenas o léxico M3 está respondendo.', type: 'warning' });
    } else if (!m1Ok && !m2Ok) {
      const hint = result.engine === 'api'
        ? 'a Hugging Face Inference API recusou a chamada (sem créditos ou cold start).'
        : 'o modelo local ainda está sendo baixado ou carregado no servidor.';
      parts.push({ icon: <AlertTriangle size={14} />, text: `M1 e M2 indisponíveis no momento: ${hint} Tente de novo em alguns segundos.`, type: 'warning' });
    }

    if (result.m2_changed) {
      parts.push({ icon: <Zap size={14} />, text: `Limiar de confiança acionado: DistilBERT bruto diria "${SENTIMENT_META[result.m2_raw?.sentiment]?.label}" (${Math.round((result.m2_raw?.score ?? 0) * 100)}%), mas com θ=0,65 o sistema classificou como "Neutro". Texto ambíguo detectado corretamente.`, type: 'primary' });
    }
    if (m1Ok && m2Ok && result.m1.sentiment !== result.m2.sentiment) {
      parts.push({ icon: <Brain size={14} />, text: `M1 (inglês) e M2 (multilingual) divergem: RoBERTa → "${SENTIMENT_META[result.m1.sentiment]?.label}" · DistilBERT → "${SENTIMENT_META[result.m2.sentiment]?.label}". Divergência típica para texto em português.`, type: 'info' });
    }
    if (m1Ok && m2Ok && !result.m2_changed && result.m1.sentiment === result.m2.sentiment) {
      parts.push({ icon: null, text: `Todos os modelos convergem para "${SENTIMENT_META[result.m2.sentiment]?.label}". Texto com sinal semântico claro, sem ambiguidade.`, type: 'success' });
    }
    return parts;
  }

  const insights = buildInsight();

  return (
    <div className="ai-demo-page">
      <div className="ai-demo">
        {/* ── Cabeçalho ── */}
        <div className="ai-demo__header">
          <span className="ai-demo__eyebrow">TourMap · Demonstração · TCC</span>
          <h1 className="ai-demo__title">Análise de Sentimento ao Vivo</h1>
          <p className="ai-demo__subtitle">
            Digite uma avaliação turística em português e compare como cada modelo classifica o sentimento.
          </p>
        </div>

        {/* ── Input ── */}
        <div className="ai-demo__input-card">
          <label className="field__label" htmlFor="demo-text">Avaliação</label>
          <textarea
            id="demo-text"
            ref={textRef}
            className="field__input ai-demo__textarea"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) analyze(); }}
            placeholder="Ex: Lugar maravilhoso, família adorou, voltaremos com certeza…"
            rows={3}
          />
          <div className="ai-demo__input-footer">
            <span className="ai-demo__char-count">{text.length}/2000 · Ctrl+Enter para analisar</span>
            <button
              className="btn btn--primary ai-demo__analyze-btn"
              onClick={analyze}
              disabled={!text.trim() || loading}
            >
              {loading ? 'Analisando…' : 'Analisar'}
            </button>
          </div>
        </div>

        {/* ── Exemplos ── */}
        <div className="ai-demo__section">
          <p className="ai-demo__section-label">Exemplos do conjunto de avaliação (frases em PT-BR)</p>
          <div className="ai-demo__examples">
            {EXAMPLES.map((ex, i) => (
              <button key={i} className="ai-demo__example-btn" onClick={() => fillExample(ex.text)}>
                <span className="ai-demo__example-dot" style={{ background: EXAMPLE_COLORS[ex.label] }} />
                <span className="ai-demo__example-text">{ex.text.slice(0, 52)}…</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Erro ── */}
        {error && (
          <div className="alert alert--error">{error}</div>
        )}

        {/* ── Resultados ── */}
        {(result || loading) && (
          <div className="ai-demo__section">
            <p className="ai-demo__section-label">Resultado dos modelos</p>
            <div className="ai-demo__grid">
              {MODELS.map(m => (
                <ModelCard
                  key={m.key}
                  model={m}
                  result={result?.[m.key]}
                  thresholdApplied={m.key === 'm2' && result?.m2_changed}
                />
              ))}
            </div>
            {result && (
              <p className="ai-demo__char-count">
                {result.engine === 'local'
                  ? `Inferência local no servidor (ONNX ${result.dtype}) · sem chamada externa`
                  : result.engine === 'api' ? 'Inferência via Hugging Face Inference API' : 'Somente léxico'}
                {' · '}{result.latency_ms} ms para os 4 resultados
              </p>
            )}
          </div>
        )}

        {/* ── Insights ── */}
        {insights?.length > 0 && (
          <div className="ai-demo__insights">
            {insights.map((ins, i) => (
              <div key={i} className={`ai-demo__insight ai-demo__insight--${ins.type}`}>
                {ins.icon && <span className="ai-demo__insight-icon">{ins.icon}</span>}
                <span>{ins.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Legenda ── */}
        <div className="ai-demo__section ai-demo__legend">
          <p className="ai-demo__section-label">Sobre os modelos</p>
          <div className="ai-demo__legend-grid">
            {[
              { tag: 'M3', color: 'var(--gray-500)', name: 'Palavras-chave', desc: 'Léxico heurístico PT-BR, sem rede neural. F1 de 96,7% nas frases usadas para criá-lo, mas só 23,2% em frases novas.' },
              { tag: 'M1', color: 'var(--info)',      name: 'RoBERTa-base',   desc: '125M parâmetros, 12 camadas, treinado em tweets em inglês. Classifica quase todo texto em português como neutro (F1 16,7% em frases novas).' },
              { tag: 'M2', color: 'var(--primary)',   name: 'DistilBERT Multilingual', desc: '134M parâmetros, 6 camadas, base em 104 idiomas incluindo PT-BR. Único que generaliza: F1 59,8% em frases novas.' },
              { tag: 'θ=0,65', color: 'var(--warning)', name: 'Híbrido (produção)', desc: 'Confiança < 65% e léxico não confirma → neutro. Elimina inversões positivo↔negativo: F1 70,2% nas 60 frases.' },
            ].map(m => (
              <div key={m.tag} className="ai-demo__legend-card">
                <span className="ai-demo__legend-tag" style={{ color: m.color, background: `color-mix(in srgb, ${m.color} 10%, white)` }}>{m.tag}</span>
                <span className="ai-demo__legend-name">{m.name}</span>
                <p className="ai-demo__legend-desc">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
