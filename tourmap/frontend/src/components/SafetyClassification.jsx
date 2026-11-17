import { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, ShieldOff, Bot, ChevronDown, ChevronUp } from 'lucide-react';
import { places as placesApi } from '../services/api';

function classify(insights, place) {
  const alertLevel = place?.alert_level;
  const avgRating  = parseFloat(place?.avg_rating || 0);
  const revCount   = place?.review_count || 0;

  // Alerta ativo — Risco direto
  if (alertLevel === 'high') {
    return {
      level: 'danger',
      label: 'Risco',
      icon: ShieldOff,
      color: '#DC2626',
      bg:   '#FEF2F2',
      text: 'Este local tem alertas de nível alto registrados. Recomendamos cautela antes de visitar.',
    };
  }

  if (!insights || !revCount) {
    return {
      level: 'unknown',
      label: 'Sem dados',
      icon: ShieldAlert,
      color: '#9CA3AF',
      bg:   '#F9FAFB',
      text: 'Ainda não há avaliações suficientes para classificar a segurança deste local.',
    };
  }

  const positivePct = insights.sentiment_distribution?.positive_pct ?? 0;
  const analyzed    = insights.sentiment_distribution?.total        ?? 0;

  // Precisamos de ao menos 3 avaliações analisadas
  if (analyzed < 3) {
    return {
      level: 'unknown',
      label: 'Dados insuficientes',
      icon: ShieldAlert,
      color: '#9CA3AF',
      bg:   '#F9FAFB',
      text: `Apenas ${analyzed} avaliação(ões) analisada(s). Precisamos de pelo menos 3 para classificar.`,
    };
  }

  if (alertLevel === 'medium') {
    return {
      level: 'warning',
      label: 'Atenção',
      icon: ShieldAlert,
      color: '#D97706',
      bg:   '#FFFBEB',
      text: `Alerta de nível médio ativo. ${positivePct}% das avaliações são positivas — visite com prudência.`,
    };
  }

  // O risco é medido pelas avaliações NEGATIVAS. Neutro não é sinal de problema:
  // o pós-processamento híbrido manda para "neutro" justamente os textos em que o
  // modelo está em dúvida. Limites alinhados com os alertas (alertService.js).
  const negativePct = insights.sentiment_distribution?.negative_pct ?? 0;
  const summary = `${positivePct}% positivas e ${negativePct}% negativas em ${analyzed} avaliações (nota ${avgRating.toFixed(1)}).`;

  if (negativePct <= 20 && avgRating >= 3.5) {
    return {
      level: 'safe',
      label: 'Seguro',
      icon: ShieldCheck,
      color: '#059669',
      bg:   '#ECFDF5',
      text: `${summary} A comunidade classifica este local como seguro.`,
    };
  }

  if (negativePct < 50) {
    return {
      level: 'warning',
      label: 'Atenção',
      icon: ShieldAlert,
      color: '#D97706',
      bg:   '#FFFBEB',
      text: `${summary} Há relatos negativos recentes — visite com atenção.`,
    };
  }

  return {
    level: 'danger',
    label: 'Risco',
    icon: ShieldOff,
    color: '#DC2626',
    bg:   '#FEF2F2',
    text: `${summary} Avaliações predominantemente negativas — considere alternativas.`,
  };
}

export default function SafetyClassification({ placeId, place, refreshKey = 0 }) {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    placesApi.insights(placeId).then(({ data }) => {
      if (!cancelled) { setInsights(data); setLoading(false); }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [placeId, refreshKey]);

  const cls = classify(loading ? null : insights, place);
  const Icon = cls.icon;

  return (
    <div className="safety-card" style={{ background: cls.bg, borderColor: cls.color + '44' }}>
      <button
        className="safety-card__header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bot size={14} color="var(--gray-400)" />
          <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 500 }}>Classificação de Segurança IA</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {loading ? (
            <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>Analisando…</span>
          ) : (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 13, fontWeight: 700, color: cls.color,
            }}>
              <Icon size={15} />
              {cls.label}
            </span>
          )}
          {expanded ? <ChevronUp size={14} color="var(--gray-400)" /> : <ChevronDown size={14} color="var(--gray-400)" />}
        </div>
      </button>

      {expanded && !loading && (
        <p className="safety-card__body">{cls.text}</p>
      )}
    </div>
  );
}
