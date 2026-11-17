import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Edit2, X, LogOut, MapPin, Star, Calendar,
  CheckCircle, ChevronRight, Clock, PlusCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { users as usersApi } from '../services/api';
import Navbar    from '../components/Navbar';
import BottomNav from '../components/BottomNav';
import Avatar    from '../components/Avatar';
import Spinner   from '../components/Spinner';
import StarRating from '../components/StarRating';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const CAT_COLORS = {
  musica:'#5B4FE8', cultura:'#EC4899', esporte:'#10B981',
  gastronomia:'#F59E0B', natureza:'#06B6D4', arte:'#8B5CF6',
};

function todayStr() {
  return new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('/').reverse().join('-');
}

const TABS = [
  { key: 'events',  label: '📅 Eventos' },
  { key: 'places',  label: '📍 Meus lugares' },
  { key: 'reviews', label: '💬 Avaliações' },
];

export default function Profile() {
  const navigate   = useNavigate();
  const { user, logout, updateUser } = useAuth();
  const { addToast } = useToast();

  const [tab, setTab]         = useState('events');
  const [editOpen, setEditOpen] = useState(false);

  const [attending, setAttending] = useState([]);
  const [myPlaces,  setMyPlaces]  = useState([]);
  const [myReviews, setMyReviews] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [meData, setMeData]       = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      usersApi.me(),
      usersApi.attending(),
      usersApi.myPlaces(),
      usersApi.myReviews(),
    ]).then(([meRes, attRes, placesRes, revRes]) => {
      setMeData(meRes.data?.user);
      setAttending(attRes.data?.items ?? []);
      setMyPlaces(placesRes.data?.items ?? []);
      setMyReviews(revRes.data?.items ?? []);
    }).catch(() => addToast('Erro ao carregar perfil.', 'error'))
      .finally(() => setLoading(false));
  }, []);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const today = todayStr();
  const upcomingEvents = attending.filter((e) => !e.event_date || e.event_date >= today);
  const pastEvents     = attending.filter((e) => e.event_date && e.event_date < today);

  const myEvents   = myPlaces.filter((p) => p.type === 'event');
  const myTourist  = myPlaces.filter((p) => p.type === 'tourist');

  const avgRating = meData?.avg_organizer_rating ? parseFloat(meData.avg_organizer_rating) : 0;

  return (
    <div className="screen">
      <Navbar />

      <div className="profile-layout">

        {/* ── Card de perfil ── */}
        <div className="profile-card">
          <div className="profile-card__avatar">
            <Avatar user={user} size={80} />
            <button className="profile-avatar-edit" onClick={() => setEditOpen(true)} aria-label="Editar">
              <Edit2 size={14} />
            </button>
          </div>
          <h1 className="profile-name">{user?.name || 'Usuário'}</h1>
          {user?.city && <p className="profile-city"><MapPin size={12} /> {user.city}</p>}
          {user?.bio  && <p className="profile-bio">{user.bio}</p>}

          {avgRating > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 6 }}>
              <StarRating value={Math.round(avgRating)} size={14} readonly />
              <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                {avgRating.toFixed(1)} como organizador ({meData?.organizer_review_count} avaliações)
              </span>
            </div>
          )}

          <button className="btn btn--ghost btn--sm" style={{ marginTop: 12 }} onClick={() => setEditOpen(true)}>
            <Edit2 size={14} /> Editar perfil
          </button>
        </div>

        {/* ── Stats ── */}
        {!loading && (
          <div className="profile-stats">
            <StatBox value={String(myPlaces.length)}   label="Criados" />
            <StatBox value={String(myReviews.length)}  label="Avaliações" />
            <StatBox value={String(upcomingEvents.length)} label="Próximos" />
          </div>
        )}

        {/* ── Abas ── */}
        <div className="sidebar-tabs" style={{ margin: '0 -0px' }}>
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              className={`sidebar-tab${tab === key ? ' sidebar-tab--active' : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
            <Spinner dark />
          </div>
        ) : (
          <div className="profile-tab-content">

            {/* ── Aba Eventos ── */}
            {tab === 'events' && (
              <div>
                {upcomingEvents.length > 0 && (
                  <Section title="Próximos eventos">
                    {upcomingEvents.map((ev) => (
                      <EventCard key={ev.id} event={ev} navigate={navigate} />
                    ))}
                  </Section>
                )}

                {pastEvents.length > 0 && (
                  <Section title="Eventos passados">
                    {pastEvents.map((ev) => (
                      <EventCard key={ev.id} event={ev} navigate={navigate} past />
                    ))}
                  </Section>
                )}

                {attending.length === 0 && (
                  <Empty
                    label="Você ainda não confirmou presença em nenhum evento."
                    action={() => navigate('/')}
                    actionLabel="Explorar eventos"
                  />
                )}
              </div>
            )}

            {/* ── Aba Meus lugares ── */}
            {tab === 'places' && (
              <div>
                {myEvents.length > 0 && (
                  <Section title={`Meus eventos (${myEvents.length})`}>
                    {myEvents.map((p) => (
                      <PlaceRow key={p.id} place={p} navigate={navigate} />
                    ))}
                  </Section>
                )}

                {myTourist.length > 0 && (
                  <Section title={`Pontos turísticos (${myTourist.length})`}>
                    {myTourist.map((p) => (
                      <PlaceRow key={p.id} place={p} navigate={navigate} />
                    ))}
                  </Section>
                )}

                {myPlaces.length === 0 && (
                  <Empty
                    label="Você ainda não criou nenhum lugar ou evento."
                    action={() => navigate('/')}
                    actionLabel="Criar um evento"
                  />
                )}
              </div>
            )}

            {/* ── Aba Avaliações ── */}
            {tab === 'reviews' && (
              <div>
                {myReviews.length > 0 ? (
                  <Section title={`Suas avaliações (${myReviews.length})`}>
                    {myReviews.map((r) => (
                      <ReviewRow key={r.id} review={r} navigate={navigate} />
                    ))}
                  </Section>
                ) : (
                  <Empty label="Você ainda não escreveu nenhuma avaliação." />
                )}
              </div>
            )}

          </div>
        )}

        {/* ── Sair ── */}
        <button
          className="profile-menu-item profile-menu-item--danger"
          style={{ margin: '12px 16px 24px' }}
          onClick={handleLogout}
        >
          <LogOut size={16} /> Sair da conta
        </button>

      </div>

      {editOpen && <EditModal user={user} onClose={() => setEditOpen(false)} onSaved={updateUser} />}
      <BottomNav />
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function StatBox({ value, label }) {
  return (
    <div className="profile-stat">
      <span className="profile-stat__val">{value}</span>
      <span className="profile-stat__label">{label}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="profile-section">
      <h3 className="profile-section__title">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ label, action, actionLabel }) {
  return (
    <div className="profile-empty">
      <p>{label}</p>
      {action && (
        <button className="btn btn--primary btn--sm" onClick={action}>
          <PlusCircle size={14} /> {actionLabel}
        </button>
      )}
    </div>
  );
}

function EventCard({ event, navigate, past = false }) {
  const isGoing = event.user_attendance === 'going';
  return (
    <div
      className={`profile-event-card${past ? ' profile-event-card--past' : ''}`}
      onClick={() => navigate(`/places/${event.id}`)}
      role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/places/${event.id}`)}
    >
      {event.image_url && (
        <img src={event.image_url} alt={event.name} className="profile-event-img" />
      )}
      <div className="profile-event-info">
        <span className="profile-event-name">{event.name}</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
          {event.event_date && (
            <span style={{ fontSize: 11, color: 'var(--gray-500)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Calendar size={11} />
              {new Date(event.event_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          )}
          {event.city && (
            <span style={{ fontSize: 11, color: 'var(--gray-500)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <MapPin size={11} /> {event.city}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: isGoing ? '#059669' : '#F59E0B',
          display: 'flex', alignItems: 'center', gap: 3 }}>
          {isGoing ? <CheckCircle size={12} /> : <Clock size={12} />}
          {isGoing ? 'Vou!' : 'Talvez'}
        </span>
        <ChevronRight size={14} color="var(--gray-300)" />
      </div>
    </div>
  );
}

function PlaceRow({ place, navigate }) {
  const color = CAT_COLORS[place.category] || 'var(--primary)';
  const isEvent = place.type === 'event';
  return (
    <div
      className="profile-place-row"
      onClick={() => navigate(`/places/${place.id}`)}
      role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/places/${place.id}`)}
    >
      <div className="profile-place-dot" style={{ background: color }} />
      <div className="profile-place-info">
        <span className="profile-place-name">{place.name}</span>
        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          {isEvent && place.event_date && (
            <span style={{ fontSize: 11, color: 'var(--gray-500)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Calendar size={10} />
              {new Date(place.event_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--gray-500)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Star size={10} fill="#F59E0B" stroke="#F59E0B" />
            {parseFloat(place.avg_rating || 0).toFixed(1)}
            <span style={{ color: 'var(--gray-400)' }}>({place.review_count})</span>
          </span>
          {isEvent && (
            <span style={{ fontSize: 11, color: 'var(--gray-500)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <CheckCircle size={10} color="#059669" /> {place.attendee_count || 0} vão
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={14} color="var(--gray-300)" />
    </div>
  );
}

function ReviewRow({ review, navigate }) {
  const place = review.place;
  const d = new Date(review.createdAt ?? review.created_at);
  return (
    <div
      className="profile-review-row"
      onClick={() => place && navigate(`/places/${place.id}`)}
      role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && place && navigate(`/places/${place.id}`)}
    >
      <div className="profile-review-info">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="profile-place-name">{place?.name || 'Lugar removido'}</span>
          <StarRating value={review.rating} size={12} readonly />
        </div>
        {review.comment && (
          <p className="profile-review-comment">{review.comment}</p>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
          {review.sentiment && (
            <span style={{ fontSize: 10, color:
              review.sentiment === 'positive' ? '#059669' :
              review.sentiment === 'negative' ? '#DC2626' : '#6B7280' }}>
              {review.sentiment === 'positive' ? '😊' : review.sentiment === 'negative' ? '😞' : '😐'}{' '}
              {review.sentiment === 'positive' ? 'Positivo' : review.sentiment === 'negative' ? 'Negativo' : 'Neutro'}
            </span>
          )}
          {!isNaN(d) && (
            <span style={{ fontSize: 10, color: 'var(--gray-400)' }}>
              {formatDistanceToNow(d, { locale: ptBR, addSuffix: true })}
            </span>
          )}
        </div>
      </div>
      {place && <ChevronRight size={14} color="var(--gray-300)" />}
    </div>
  );
}

function EditModal({ user, onClose, onSaved }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({
    name:       user?.name       || '',
    bio:        user?.bio        || '',
    city:       user?.city       || '',
    avatar_url: user?.avatar_url || '',
  });
  const [loading, setLoading] = useState(false);

  function set(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) { addToast('O nome é obrigatório.', 'warning'); return; }
    setLoading(true);
    try {
      const { data } = await usersApi.update({
        name:       form.name.trim(),
        bio:        form.bio.trim() || null,
        city:       form.city.trim() || null,
        avatar_url: form.avatar_url.trim() || null,
      });
      onSaved?.(data.user || form);
      addToast('Perfil atualizado!', 'success');
      onClose();
    } catch (err) {
      addToast(err.response?.data?.error || 'Erro ao salvar.', 'error');
    } finally { setLoading(false); }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal__header">
          <h2 className="modal__title"><Edit2 size={16} /> Editar perfil</h2>
          <button className="modal__close" onClick={onClose}><X size={18} /></button>
        </div>
        <form className="modal__body" onSubmit={handleSave}>
          <div className="field">
            <label className="field__label">Nome *</label>
            <input className="field__input" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="field">
            <label className="field__label">Cidade</label>
            <input className="field__input" placeholder="Ex: São Paulo, SP" value={form.city} onChange={(e) => set('city', e.target.value)} />
          </div>
          <div className="field">
            <label className="field__label">Bio</label>
            <textarea className="field__input" rows={3} value={form.bio} onChange={(e) => set('bio', e.target.value)} style={{ resize: 'vertical' }} />
          </div>
          <div className="field">
            <label className="field__label">URL do avatar</label>
            <input className="field__input" type="url" placeholder="https://…" value={form.avatar_url} onChange={(e) => set('avatar_url', e.target.value)} />
          </div>
          <div className="modal__footer">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn--primary" disabled={loading} style={{ flex: 1 }}>
              {loading ? <Spinner /> : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
