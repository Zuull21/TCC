const CFG = {
  positive: { emoji: '😊', label: 'Positivo', color: '#065F46', bg: '#ECFDF5', border: '#6EE7B7' },
  neutral:  { emoji: '😐', label: 'Neutro',   color: '#374151', bg: '#F9FAFB', border: '#D1D5DB' },
  negative: { emoji: '😞', label: 'Negativo', color: '#991B1B', bg: '#FEF2F2', border: '#FECACA' },
};

export default function SentimentBadge({ sentiment, score, isNew = false }) {
  // Ainda processando (review recém-criada antes da IA responder)
  if (sentiment === null && isNew) {
    return (
      <span
        title="Analisando sentimento…"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 11, color: 'var(--gray-400)',
          background: 'var(--gray-100)', border: '1px solid var(--gray-200)',
          borderRadius: 'var(--radius-full)', padding: '2px 8px',
        }}
      >
        <span className="spinner spinner--dark" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
        Analisando
      </span>
    );
  }

  const cfg = CFG[sentiment];
  if (!cfg) return null;

  const tooltipText = score != null
    ? `IA: ${cfg.label} — ${Math.round(score * 100)}% de confiança`
    : `IA: ${cfg.label}`;

  return (
    <span
      title={tooltipText}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 11, fontWeight: 600,
        color: cfg.color, background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: 'var(--radius-full)', padding: '2px 8px',
        cursor: 'default', userSelect: 'none',
      }}
    >
      {cfg.emoji} {cfg.label}
      {score != null && (
        <span style={{ fontWeight: 400, opacity: .75 }}>
          {Math.round(score * 100)}%
        </span>
      )}
    </span>
  );
}
