import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Edit2, Trash2, CheckCircle, Users, Calendar } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { places as placesApi, users as usersApi } from '../services/api';
import Navbar      from '../components/Navbar';
import BottomNav   from '../components/BottomNav';
import StarRating  from '../components/StarRating';
import Spinner     from '../components/Spinner';
import { categoryLabel } from '../utils/categories';

const CAT_COLORS = {
  musica:'#5B4FE8',cultura:'#EC4899',esporte:'#10B981',
  gastronomia:'#F59E0B',natureza:'#06B6D4',arte:'#8B5CF6',
};

export default function Events() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { addToast } = useToast();
  const [tab, setTab]               = useState('created');
  const [places, setPlaces]         = useState([]);
  const [attending, setAttending]   = useState([]);
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
    load();
  }, [isAuthenticated]);

  async function load() {
    setLoading(true);
    try {
      const [myPlacesRes, attendingRes] = await Promise.all([
        usersApi.myPlaces(),   // retorna TODOS os lugares do usuário (tourist + event)
        usersApi.attending(),
      ]);
      setPlaces(myPlacesRes.data.items || []);
      setAttending(attendingRes.data.items || []);
    } catch {
      addToast('Erro ao carregar seus eventos.', 'error');
      setPlaces([]); setAttending([]);
    } finally { setLoading(false); }
  }

  function isFinished(place) {
    if (!place.event_date) return false;
    // Data atual no horário de Brasília (UTC-3)
    const todayBrasilia = new Date()
      .toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
      .split('/').reverse().join('-'); // DD/MM/YYYY → YYYY-MM-DD
    // Evento de hoje ainda está ativo; encerra a partir do dia seguinte
    return place.event_date < todayBrasilia;
  }

  const created  = places.filter((p) => p.type === 'event');
  const active   = created.filter((p) => !isFinished(p));
  const finished = created.filter((p) =>  isFinished(p));

  async function handleDelete(id) {
    if (!window.confirm('Remover este lugar?')) return;
    try {
      await placesApi.remove(id);
      setPlaces((p) => p.filter((x) => x.id !== id));
      addToast('Lugar removido.', 'success');
    } catch { addToast('Erro ao remover.', 'error'); }
  }

  return (
    <div className="screen">
      <Navbar />

      <div className="events-layout">
        <div className="events-header">
          <h1 className="events-title">Meus Eventos</h1>
          <button className="btn btn--primary btn--sm" onClick={() => navigate('/create')}>
            + Novo
          </button>
        </div>

        {/* Abas */}
        <div className="events-tabs">
          <button className={`events-tab${tab === 'created' ? ' events-tab--active' : ''}`} onClick={() => setTab('created')}>
            Criados por mim ({created.length})
          </button>
          <button className={`events-tab${tab === 'finished' ? ' events-tab--active' : ''}`} onClick={() => setTab('finished')} style={{ display: finished.length ? undefined : 'none' }}>
            Encerrados ({finished.length})
          </button>
          <button className={`events-tab${tab === 'participating' ? ' events-tab--active' : ''}`} onClick={() => setTab('participating')}>
            Participando ({attending.length})
          </button>
        </div>

        {loading ? (
          <Spinner center dark />
        ) : tab === 'created' ? (
          active.length === 0 && finished.length === 0 ? (
            <EmptyState text="Você ainda não criou nenhum evento. Use o botão + Novo acima para começar." />
          ) : (
            <div className="events-grid">
              {active.map((place) => (
                <EventItem
                  key={place.id}
                  place={place}
                  onView={() => navigate(`/places/${place.id}`)}
                  onEdit={() => navigate(`/events/${place.id}/edit`)}
                  onDelete={() => handleDelete(place.id)}
                  showActions
                />
              ))}
              {active.length === 0 && (
                <EmptyState text="Nenhum evento ativo. Veja a aba Encerrados." />
              )}
            </div>
          )
        ) : tab === 'finished' ? (
          <div className="events-grid">
            {finished.map((place) => (
              <EventItem
                key={place.id}
                place={place}
                onView={() => navigate(`/places/${place.id}`)}
                onEdit={() => navigate(`/events/${place.id}/edit`)}
                onDelete={() => handleDelete(place.id)}
                showActions
                badge="🔒 Encerrado"
              />
            ))}
          </div>
        ) : attending.length === 0 ? (
          <EmptyState
            text="Você ainda não confirmou presença em nenhum evento."
            cta="Explorar eventos"
            onCta={() => navigate('/explore')}
          />
        ) : (
          <div className="events-grid">
            {attending.map((place) => (
              <EventItem
                key={place.id}
                place={place}
                onView={() => navigate(`/places/${place.id}`)}
                badge={place.user_attendance === 'going' ? '✅ Vou!' : '🤔 Talvez'}
              />
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

function EventItem({ place, onView, onEdit, onDelete, showActions, badge }) {
  const color = CAT_COLORS[place.category] || '#5B4FE8';
  return (
    <div className="event-item" onClick={onView} role="button" tabIndex={0}
         onKeyDown={(e) => e.key === 'Enter' && onView()}>
      <div className="event-item__img">
        {place.image_url
          ? <img src={place.image_url} alt={place.name} loading="lazy" />
          : <div style={{ background: `${color}18`, width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <MapPin size={24} color={color} />
            </div>}
        <span className="event-item__cat" style={{ background: color }}>{categoryLabel(place.category)}</span>
        {showActions
          ? <span className="event-item__confirmed"><CheckCircle size={11} /> Criado</span>
          : badge && <span className="event-item__confirmed">{badge}</span>}
      </div>
      <div className="event-item__body">
        <h3 className="event-item__name">{place.name}</h3>
        {place.event_date && (
          <p className="event-item__location" style={{ color: 'var(--primary)' }}>
            <Calendar size={11} /> {new Date(place.event_date + 'T00:00:00').toLocaleDateString('pt-BR')}
          </p>
        )}
        {place.city && <p className="event-item__location"><MapPin size={11} /> {place.city}</p>}
        {place.attendee_count > 0 && (
          <p className="event-item__location"><Users size={11} /> {place.attendee_count} confirmados</p>
        )}
        <StarRating value={Math.round(parseFloat(place.avg_rating || 0))} size={13} readonly />
      </div>
      {showActions && (
        <div className="event-item__actions">
          <button className="btn btn--ghost btn--sm" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <Edit2 size={13} />
          </button>
          <button className="btn btn--sm" style={{ color:'var(--danger)', background:'var(--danger-light)', border:'none' }}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyState({ text, cta, onCta }) {
  return (
    <div className="explore-empty" style={{ marginTop: 40 }}>
      <div style={{ fontSize: 52 }}>📭</div>
      <p>{text}</p>
      {cta && <button className="btn btn--primary btn--sm" onClick={onCta}>{cta}</button>}
    </div>
  );
}
