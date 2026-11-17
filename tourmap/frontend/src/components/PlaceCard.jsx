import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Star, Navigation, AlertTriangle, Calendar, CheckCircle, Clock } from 'lucide-react';

const CATEGORY_COLORS = {
  musica:      '#5B4FE8',
  cultura:     '#EC4899',
  esporte:     '#10B981',
  gastronomia: '#F59E0B',
  natureza:    '#06B6D4',
  arte:        '#8B5CF6',
};

const CATEGORY_LABELS = {
  musica: 'Música', cultura: 'Cultura', esporte: 'Esporte',
  gastronomia: 'Gastronomia', natureza: 'Natureza', arte: 'Arte',
};

function Stars({ rating }) {
  const r = parseFloat(rating) || 0;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={12}
          fill={n <= Math.round(r) ? '#F59E0B' : 'none'}
          stroke={n <= Math.round(r) ? '#F59E0B' : '#D1D5DB'}
        />
      ))}
      <span style={{ fontSize: 12, color: 'var(--gray-500)', marginLeft: 3 }}>
        {r > 0 ? r.toFixed(1) : '—'}
      </span>
    </span>
  );
}

function safetyBadge(place) {
  if (place.alert_level === 'high')   return { label: 'Risco',   color: '#FEE2E2', text: '#991B1B' };
  if (place.alert_level === 'medium') return { label: 'Atenção', color: '#FEF3C7', text: '#92400E' };
  const avg   = parseFloat(place.avg_rating || 0);
  const count = place.review_count || 0;
  if (count >= 3 && avg >= 4.0) return { label: 'Seguro', color: '#D1FAE5', text: '#065F46' };
  return null;
}

function isEventFinished(place) {
  if (place.type !== 'event' || place.is_fixed) return false;
  if (!place.event_date) return false;
  const today = new Date()
    .toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
    .split('/').reverse().join('-');
  return place.event_date < today;
}

function formatTime(t) {
  if (!t) return null;
  return t.slice(0, 5);
}

const PlaceCard = memo(function PlaceCard({
  place,
  selected,
  onSelect,
  onRoute,
  // props de RSVP (opcionais — só aparecem quando passadas)
  userAttendance,
  onRsvp,
  isAuthenticated,
}) {
  // Hooks sempre antes de qualquer return condicional (regra do React)
  const navigate = useNavigate();
  const [rsvpLoading, setRsvpLoading] = useState(false);
  if (!place) return null;

  const color     = CATEGORY_COLORS[place.category] || 'var(--primary)';
  const isAlert   = place.alert_level === 'high' || place.alert_level === 'medium';
  const safety    = safetyBadge(place);
  const isEvent   = place.type === 'event';
  const finished  = isEventFinished(place);

  async function handleRsvp(e, status) {
    e.stopPropagation();
    if (!isAuthenticated || !onRsvp) return;
    setRsvpLoading(true);
    try {
      await onRsvp(place.id, status);
    } finally {
      setRsvpLoading(false); // não deixa o botão travado se a requisição falhar
    }
  }

  return (
    <div
      className={`place-card${selected ? ' place-card--selected' : ''}`}
      onClick={() => onSelect?.(place)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect?.(place)}
    >
      {/* Imagem */}
      <div className="place-card__img">
        {place.image_url
          ? <img src={place.image_url} alt={place.name} loading="lazy"
              onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling.style.display = 'flex'; }} />
          : null}
        <div className="place-card__img-placeholder" style={{ background: `${color}22`, display: place.image_url ? 'none' : 'flex' }}>
          <MapPin size={24} color={color} />
        </div>

        <span className="place-card__badge" style={{ background: color }}>
          {isEvent ? '📅 Evento' : (CATEGORY_LABELS[place.category] || place.category)}
        </span>

        {isAlert && (
          <span className="place-card__alert-badge">
            <AlertTriangle size={11} /> {place.alert_level === 'high' ? 'Alto' : 'Médio'}
          </span>
        )}

        {finished && (
          <span className="place-card__alert-badge" style={{ background: '#6B7280' }}>
            🔒 Encerrado
          </span>
        )}
      </div>

      {/* Conteúdo */}
      <div className="place-card__body">
        <h3 className="place-card__name">{place.name}</h3>

        {/* Data e horário do evento */}
        {isEvent && place.event_date && (
          <p style={{ fontSize: 12, color: 'var(--primary)', margin: '2px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Calendar size={11} />
            {new Date(place.event_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            {place.event_start_time && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Clock size={10} /> {formatTime(place.event_start_time)}
                {place.event_end_time && ` – ${formatTime(place.event_end_time)}`}
              </span>
            )}
            {place.attendee_count > 0 && ` · ${place.attendee_count} vão`}
          </p>
        )}

        <div className="place-card__meta">
          <Stars rating={place.avg_rating} />
          {place.review_count > 0 && (
            <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>({place.review_count})</span>
          )}
          {place.distance_km != null && (
            <span className="place-card__dist">
              <Navigation size={11} />
              {place.distance_km < 1
                ? `${Math.round(place.distance_km * 1000)}m`
                : `${place.distance_km}km`}
            </span>
          )}
        </div>

        {place.city && (
          <p className="place-card__location">
            <MapPin size={11} /> {place.city}{place.state ? `, ${place.state}` : ''}
          </p>
        )}

        {/* Badge de segurança */}
        {safety && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, fontWeight: 500,
            padding: '2px 7px', borderRadius: 12, marginBottom: 4,
            background: safety.color, color: safety.text,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: safety.text, flexShrink: 0 }} />
            {safety.label}
          </span>
        )}

        {/* Ações */}
        <div className="place-card__actions">
          <button
            className="btn btn--primary btn--sm"
            style={{ flex: 1, fontSize: 13, padding: '7px 10px',
              background: isEvent ? '#7C3AED' : undefined }}
            onClick={(e) => { e.stopPropagation(); navigate(`/places/${place.id}`); }}
          >
            Ver detalhes
          </button>

          {/* RSVP rápido — só para eventos ativos e usuários autenticados */}
          {isEvent && !finished && isAuthenticated && onRsvp && (
            <button
              className={`btn btn--sm ${userAttendance === 'going' ? 'btn--primary' : 'btn--ghost'}`}
              style={{
                fontSize: 12, padding: '7px 10px', minWidth: 70,
                background: userAttendance === 'going' ? '#059669' : undefined,
                borderColor: userAttendance === 'going' ? '#059669' : undefined,
              }}
              onClick={(e) => handleRsvp(e, 'going')}
              disabled={rsvpLoading}
              title={userAttendance === 'going' ? 'Cancelar presença' : 'Confirmar presença'}
            >
              {rsvpLoading ? '…' : userAttendance === 'going'
                ? <><CheckCircle size={12} /> Confirmado</>
                : <><Clock size={12} /> Participar</>}
            </button>
          )}

          <button
            className="btn btn--ghost btn--sm"
            style={{ fontSize: 13, padding: '7px 10px' }}
            onClick={(e) => { e.stopPropagation(); onRoute?.(place); }}
            title="Como chegar"
          >
            <Navigation size={14} />
          </button>
        </div>
      </div>
    </div>
  );
});

export default PlaceCard;
