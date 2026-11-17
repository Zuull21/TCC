import { useState, useEffect } from 'react';
import { Users, Star, TrendingUp, MessageSquare, Target, RefreshCw } from 'lucide-react';
import { places as placesApi } from '../services/api';
import Spinner from './Spinner';

function StatCard({ icon: Icon, label, value, sub, color = 'var(--primary)' }) {
  return (
    <div className="dash-stat">
      <div className="dash-stat__icon" style={{ background: color + '18', color }}>
        <Icon size={18} />
      </div>
      <div className="dash-stat__body">
        <span className="dash-stat__val">{value}</span>
        <span className="dash-stat__label">{label}</span>
        {sub && <span className="dash-stat__sub">{sub}</span>}
      </div>
    </div>
  );
}

function SentBar({ label, pct, color, count }) {
  return (
    <div className="dash-sent-row">
      <span className="dash-sent-label">{label}</span>
      <div className="dash-sent-track">
        <div className="dash-sent-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="dash-sent-pct" style={{ color }}>{pct}%</span>
      <span className="dash-sent-count">({count})</span>
    </div>
  );
}

function AttendanceBar({ going, maybe, capacity }) {
  const pctGoing = capacity ? Math.min(100, Math.round((going / capacity) * 100)) : 0;
  const fill = capacity
    ? (going / capacity >= 0.9 ? '#DC2626' : going / capacity >= 0.7 ? '#F59E0B' : '#059669')
    : '#059669';

  return (
    <div className="dash-attend">
      <div className="dash-attend__nums">
        <span><strong style={{ color: '#059669' }}>{going}</strong> confirmados</span>
        {maybe > 0 && <span><strong style={{ color: '#F59E0B' }}>{maybe}</strong> talvez</span>}
        {capacity && <span style={{ color: 'var(--gray-400)' }}>/ {capacity} vagas</span>}
      </div>
      {capacity > 0 && (
        <>
          <div className="dash-attend__bar">
            <div className="dash-attend__fill" style={{ width: `${pctGoing}%`, background: fill }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>{pctGoing}% da capacidade preenchida</span>
        </>
      )}
    </div>
  );
}

export default function OrganizerDashboard({ placeId, place }) {
  const [attendees, setAttendees] = useState(null);
  const [insights, setInsights]   = useState(null);
  const [loading, setLoading]     = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [attRes, insRes] = await Promise.all([
        placesApi.attendees(placeId, { limit: 1 }),
        placesApi.insights(placeId),
      ]);
      setAttendees(attRes.data);
      setInsights(insRes.data);
    } catch {
      // falha silenciosa — mostra o que tiver
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [placeId]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
      <Spinner dark />
    </div>
  );

  const going   = attendees?.going   ?? place?.attendee_count ?? 0;
  const maybe   = attendees?.maybe   ?? 0;
  const capacity = place?.max_attendees ?? 0;
  const avgRating = parseFloat(place?.avg_rating ?? 0);
  const revCount  = place?.review_count ?? 0;

  const dist    = insights?.sentiment_distribution;
  const keywords = insights?.top_keywords ?? [];
  const positivePct = dist?.positive_pct ?? 0;

  // Saúde geral: score de 0-100 combinando sentimento + nota
  const healthScore = revCount > 0
    ? Math.round(positivePct * 0.6 + (avgRating / 5) * 100 * 0.4)
    : null;

  const healthLabel = healthScore === null ? null
    : healthScore >= 75 ? { label: 'Ótimo', color: '#059669' }
    : healthScore >= 50 ? { label: 'Bom', color: '#F59E0B' }
    : { label: 'Precisa de atenção', color: '#DC2626' };

  return (
    <div className="organizer-dashboard">
      {/* Cabeçalho */}
      <div className="organizer-dashboard__header">
        <TrendingUp size={16} color="var(--primary)" />
        <h3>Dashboard do Organizador</h3>
        <button className="ranking-panel__refresh" onClick={load} title="Atualizar">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Score de saúde geral */}
      {healthScore !== null && (
        <div className="dash-health" style={{ background: healthLabel.color + '14', borderColor: healthLabel.color + '44' }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: healthLabel.color }}>{healthScore}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: healthLabel.color }}>{healthLabel.label}</div>
            <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>Score de saúde do evento (sentimento + nota)</div>
          </div>
        </div>
      )}

      {/* Stat boxes */}
      <div className="dash-stats-grid">
        <StatCard
          icon={Users} label="Confirmados" color="#059669"
          value={going}
          sub={capacity ? `de ${capacity} vagas` : undefined}
        />
        <StatCard
          icon={Star} label="Nota média" color="#F59E0B"
          value={avgRating > 0 ? avgRating.toFixed(1) : '—'}
          sub={revCount > 0 ? `${revCount} avaliações` : 'Sem avaliações'}
        />
        <StatCard
          icon={MessageSquare} label="Sentimento +" color="#7C3AED"
          value={dist?.total > 0 ? `${positivePct}%` : '—'}
          sub={dist?.total > 0 ? `${dist.total} analisadas` : 'Sem análises'}
        />
        {capacity > 0 && (
          <StatCard
            icon={Target} label="Ocupação" color="#2563EB"
            value={`${Math.min(100, Math.round((going / capacity) * 100))}%`}
            sub={`${capacity - going > 0 ? capacity - going : 0} vagas restantes`}
          />
        )}
      </div>

      {/* Barra de ocupação */}
      {(going > 0 || maybe > 0) && (
        <div className="dash-section">
          <h4 className="dash-section__title">Participação</h4>
          <AttendanceBar going={going} maybe={maybe} capacity={capacity} />
        </div>
      )}

      {/* Sentimento */}
      {dist && dist.total > 0 && (
        <div className="dash-section">
          <h4 className="dash-section__title">Distribuição de sentimento</h4>
          <div className="dash-sent-bars">
            <SentBar label="😊 Positivo" pct={dist.positive_pct} color="#059669" count={dist.positive} />
            <SentBar label="😐 Neutro"   pct={dist.neutral_pct}  color="#6B7280" count={dist.neutral} />
            <SentBar label="😞 Negativo" pct={dist.negative_pct} color="#DC2626" count={dist.negative} />
          </div>
        </div>
      )}

      {/* Palavras-chave */}
      {keywords.length > 0 && (
        <div className="dash-section">
          <h4 className="dash-section__title">O que falam do seu evento</h4>
          <div className="ai-insights__tags">
            {keywords.map(({ word, count }) => (
              <span key={word} className="ai-insights__tag"
                style={{ fontSize: Math.min(14, 10 + count), opacity: 0.6 + Math.min(0.4, count * 0.05) }}>
                {word}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Resumo IA */}
      {insights?.summary_text && (
        <div className="dash-section">
          <h4 className="dash-section__title">Resumo da IA</h4>
          <p className="dash-summary">{insights.summary_text}</p>
        </div>
      )}

      {revCount === 0 && going === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--gray-400)', fontSize: 13, padding: '16px 0' }}>
          Seu evento ainda não tem avaliações ou participantes confirmados.
        </p>
      )}
    </div>
  );
}
