import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, AlertCircle } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: <CheckCircle2 size={16} />,
  warning: <AlertTriangle size={16} />,
  error:   <AlertCircle  size={16} />,
  info:    <Info         size={16} />,
};

const COLORS = {
  success: { bg: 'var(--success-light)', border: 'var(--success)', text: '#065F46' },
  warning: { bg: 'var(--warning-light)', border: 'var(--warning)', text: '#92400E' },
  error:   { bg: 'var(--danger-light)',  border: 'var(--danger)',  text: '#991B1B' },
  info:    { bg: 'var(--info-light)',    border: 'var(--info)',    text: '#0C4A6E' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div style={{
        position: 'fixed', bottom: 24, right: 16,
        display: 'flex', flexDirection: 'column', gap: 8,
        zIndex: 9999, maxWidth: 340, width: 'calc(100vw - 32px)',
        pointerEvents: 'none',
      }}>
        {toasts.map((t) => {
          const c = COLORS[t.type] || COLORS.info;
          return (
            <div key={t.id} style={{
              background: c.bg,
              border: `1px solid ${c.border}`,
              borderLeft: `4px solid ${c.border}`,
              borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
              display: 'flex', alignItems: 'flex-start', gap: 10,
              boxShadow: 'var(--shadow-md)',
              color: c.text, fontSize: 14, lineHeight: 1.5,
              animation: 'slideUp .25s ease',
              pointerEvents: 'all',
            }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>{ICONS[t.type]}</span>
              <span style={{ flex: 1 }}>{t.message}</span>
              <button
                onClick={() => remove(t.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                         color: c.text, opacity: .6, flexShrink: 0, padding: 0 }}>
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>');
  return ctx;
}
