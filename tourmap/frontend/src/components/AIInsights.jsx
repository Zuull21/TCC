import { useState, useEffect } from 'react';
import { Bot, RefreshCw } from 'lucide-react';
import { places as placesApi } from '../services/api';
import Spinner from './Spinner';

export default function AIInsights({ placeId, refreshKey = 0 }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  // refreshKey muda sempre que reviews são adicionadas/editadas/removidas
  useEffect(() => { load(); }, [placeId, refreshKey]);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const { data: res } = await placesApi.insights(placeId);
      setData(res);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="ai-insights ai-insights--loading">
        <Spinner dark />
        <span>Carregando análise de IA…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="ai-insights ai-insights--error">
        <span style={{ color: 'var(--gray-400)', fontSize: 13 }}>
          Não foi possível carregar a análise.
        </span>
        <button className="btn btn--ghost btn--sm" onClick={load}>
          <RefreshCw size={13} /> Tentar novamente
        </button>
      </div>
    );
  }

  const { sentiment_distribution: dist, top_keywords, summary_text, total_reviews } = data;

  if (total_reviews === 0) {
    return (
      <div className="ai-insights">
        <div className="ai-insights__header">
          <Bot size={18} color="var(--primary)" />
          <h3>Análise Inteligente</h3>
        </div>
        <p style={{ color: 'var(--gray-400)', fontSize: 13 }}>
          Nenhuma avaliação analisada ainda.
        </p>
      </div>
    );
  }

  const bars = [
    { label: '😊 Positivas', pct: dist.positive_pct, color: '#059669', count: dist.positive },
    { label: '😐 Neutras',   pct: dist.neutral_pct,  color: '#6B7280', count: dist.neutral  },
    { label: '😞 Negativas', pct: dist.negative_pct, color: '#DC2626', count: dist.negative },
  ];

  return (
    <div className="ai-insights">
      <div className="ai-insights__header">
        <Bot size={18} color="var(--primary)" />
        <h3>Análise Inteligente</h3>
        <span className="ai-insights__count">{dist.total} avaliadas</span>
        <button
          className="ai-insights__refresh"
          onClick={load}
          title="Atualizar análise"
          aria-label="Atualizar"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Distribuição de sentimento */}
      <div className="ai-insights__bars">
        {bars.map(({ label, pct, color, count }) => (
          <div key={label} className="ai-insights__bar-row">
            <span className="ai-insights__bar-label">{label}</span>
            <div className="ai-insights__bar-track">
              <div
                className="ai-insights__bar-fill"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
            <span className="ai-insights__bar-pct">{pct}%</span>
            <span className="ai-insights__bar-count">({count})</span>
          </div>
        ))}
      </div>

      {/* Palavras-chave */}
      {top_keywords.length > 0 && (
        <div className="ai-insights__keywords">
          <p className="ai-insights__section-label">Tópicos mencionados</p>
          <div className="ai-insights__tags">
            {top_keywords.map(({ word, count }) => (
              <span
                key={word}
                className="ai-insights__tag"
                title={`${count} menções`}
                style={{
                  fontSize: Math.min(14, 10 + count),
                  opacity: 0.6 + Math.min(0.4, count * 0.05),
                }}
              >
                {word}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Resumo */}
      {summary_text && (
        <div className="ai-insights__summary">
          <p className="ai-insights__section-label">Resumo da IA</p>
          <p className="ai-insights__summary-text">{summary_text}</p>
        </div>
      )}
    </div>
  );
}
