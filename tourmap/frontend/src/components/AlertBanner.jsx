import { useState } from 'react';
import { AlertOctagon, Zap, Info, ChevronDown, ChevronUp, X } from 'lucide-react';

const CFG = {
  high: {
    icon: '⚠️',
    Icon: AlertOctagon,
    bg: '#FEF2F2',
    border: '#FECACA',
    text: '#991B1B',
    accent: '#DC2626',
    defaultMsg: 'Atenção: este local possui relatos recentes negativos. Tome precauções antes de visitar.',
  },
  medium: {
    icon: '⚡',
    Icon: Zap,
    bg: '#FFFBEB',
    border: '#FDE68A',
    text: '#92400E',
    accent: '#D97706',
    defaultMsg: 'Este local teve queda recente de avaliação. Verifique as condições antes de ir.',
  },
  low: {
    icon: 'ℹ️',
    Icon: Info,
    bg: '#EFF6FF',
    border: '#BFDBFE',
    text: '#1E40AF',
    accent: '#3B82F6',
    defaultMsg: 'Avaliação abaixo da média recentemente. Leia as avaliações mais recentes.',
  },
};

export default function AlertBanner({ level, alert, onDismiss }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = CFG[level];
  if (!cfg) return null;

  const displayMsg = expanded && alert?.message ? alert.message : cfg.defaultMsg;
  const hasDetails = alert?.message && alert.message !== cfg.defaultMsg;

  return (
    <div
      className="alert-banner"
      style={{ '--ab-bg': cfg.bg, '--ab-border': cfg.border, '--ab-text': cfg.text, '--ab-accent': cfg.accent }}
      role="alert"
    >
      <span className="alert-banner__emoji">{cfg.icon}</span>

      <div className="alert-banner__body">
        <p className="alert-banner__msg">{displayMsg}</p>

        {alert?.trigger_type && expanded && (
          <span className="alert-banner__tag">
            Origem: {alert.trigger_type}
          </span>
        )}
      </div>

      <div className="alert-banner__actions">
        {hasDetails && (
          <button
            className="alert-banner__btn"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? 'Menos' : 'Detalhes'}
          </button>
        )}
        {onDismiss && (
          <button className="alert-banner__dismiss" onClick={onDismiss} aria-label="Fechar alerta">
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
