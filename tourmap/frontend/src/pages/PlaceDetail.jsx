import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { ArrowLeft, MapPin, Navigation, Share2, Star, Users, Calendar, CheckCircle, Clock, UserCircle2, Trash2, Pencil } from 'lucide-react';
import { useAuth }           from '../context/AuthContext';
import { useToast }          from '../components/Toast';
import { useSocket }         from '../hooks/useSocket';
import { useNotifications }  from '../context/NotificationsContext';
import Navbar                from '../components/Navbar';
import BottomNav             from '../components/BottomNav';
import Avatar                from '../components/Avatar';
import StarRating            from '../components/StarRating';
import AlertBanner           from '../components/AlertBanner';
import SentimentBadge        from '../components/SentimentBadge';
import AIInsights            from '../components/AIInsights';
import SafetyClassification  from '../components/SafetyClassification';
import OrganizerDashboard    from '../components/OrganizerDashboard';
import ReviewForm            from '../components/ReviewForm';
import Spinner               from '../components/Spinner';
import { places as placesApi, reviews as reviewsApi, posts as postsApi, users as usersApi } from '../services/api';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { categoryLabel } from '../utils/categories';

const CAT_COLORS = {
  musica:'#5B4FE8', cultura:'#EC4899', esporte:'#10B981',
  gastronomia:'#F59E0B', natureza:'#06B6D4', arte:'#8B5CF6',
};

function placeMarkerIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:20px;height:20px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`,
    iconSize:[20,20], iconAnchor:[10,10], popupAnchor:[0,-12],
  });
}

export default function PlaceDetail() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const { addToast } = useToast();
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('tourmap_token') : null;

  const { user, isAuthenticated } = useAuth();

  const [place, setPlace]         = useState(null);
  const [heroImgError, setHeroImgError] = useState(false);
  const [activeAlert, setActiveAlert] = useState(null);
  const [reviews, setReviews]     = useState([]);
  const [posts, setPosts]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState('reviews');
  const [revPage, setRevPage]     = useState(1);
  const [revHasMore, setRevHasMore] = useState(false);
  const [loadingRevs, setLoadingRevs] = useState(false);
  const [newReviewIds, setNewReviewIds] = useState(new Set());
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [ratingDist, setRatingDist] = useState([]);
  const [postedReview, setPostedReview] = useState(null);
  const seenReviewIds = useRef(new Set());

  // Participação
  const [userAttendance, setUserAttendance]       = useState(null);
  const [attendeesPreview, setAttendeesPreview]   = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // Avaliações do organizador
  const [orgReviews, setOrgReviews]           = useState([]);
  const [orgReviewForm, setOrgReviewForm]     = useState({ rating: 0, comment: '' });
  const [orgReviewLoading, setOrgReviewLoading] = useState(false);
  const [orgReviewError, setOrgReviewError]   = useState('');
  const [hasReviewedOrg, setHasReviewedOrg]   = useState(false);

  const [deleting, setDeleting] = useState(false);

  // Chave de atualização do AIInsights — incrementada a cada mudança de review
  const [insightKey, setInsightKey] = useState(0);

  // Edição e exclusão de reviews
  const [editingReview,   setEditingReview]   = useState(null);
  const [editRating,      setEditRating]      = useState(0);
  const [editComment,     setEditComment]     = useState('');
  const [editLoading,     setEditLoading]     = useState(false);
  const [deletingRevId,   setDeletingRevId]   = useState(null);

  // ── Carregar dados ──────────────────────────────────────────────────────────
  useEffect(() => { load(); }, [id]);

  async function load() {
    // Reseta estado derivado do lugar anterior ao trocar de rota
    setTab('reviews');
    setRevPage(1);
    setPostedReview(null);
    setHeroImgError(false);
    setLoading(true);
    setAlertDismissed(false);
    setHasReviewedOrg(false);
    try {
      const [placeRes, revRes, postRes] = await Promise.all([
        placesApi.get(id),
        reviewsApi.list(id, { page: 1, limit: 10 }),
        postsApi.list({ place_id: id, limit: 5 }),
      ]);
      const placeData = placeRes.data.place;
      setPlace(placeData);
      setActiveAlert(placeData?.alerts?.find((a) => a.is_active !== false) || null);
      setRatingDist(placeRes.data.rating_distribution || []);
      setReviews(revRes.data.items);
      seenReviewIds.current = new Set(revRes.data.items.map((r) => r.id));
      setRevHasMore(revRes.data.items.length === 10);
      setPosts(postRes.data.items);

      if (placeData?.type === 'event') {
        setUserAttendance(placeRes.data.user_attendance);
        setAttendeesPreview(placeRes.data.attendees_preview || []);

        if (placeData.created_by) {
          try {
            // Máximo aceito pela API é 50 (com 100 a requisição era recusada e a lista ficava vazia)
            const orgRevRes = await usersApi.organizerReviews(placeData.created_by, { limit: 50 });
            const items = orgRevRes.data.items || [];
            setOrgReviews(items);
            if (user?.id) {
              // Verifica se o usuário já avaliou o organizador NESTE evento específico
              setHasReviewedOrg(items.some(
                (r) => r.reviewer?.id === user.id && Number(r.event?.id) === parseInt(id, 10)
              ));
            }
          } catch { /* sem avaliações ainda */ }
        }
      }
    } catch { navigate('/explore'); }
    finally  { setLoading(false); }
  }

  async function handleDelete() {
    if (!window.confirm('Tem certeza que quer excluir este evento? Esta ação não pode ser desfeita.')) return;
    setDeleting(true);
    try {
      await placesApi.remove(id);
      addToast('Evento excluído.', 'success');
      navigate('/events');
    } catch (err) {
      addToast(err.response?.data?.error || 'Erro ao excluir o evento.', 'error');
      setDeleting(false);
    }
  }

  async function handleAttend(status) {
    if (!isAuthenticated) { addToast('Faça login para confirmar presença.', 'warning'); return; }
    setAttendanceLoading(true);
    try {
      if (userAttendance === status) {
        await placesApi.unattend(id);
        setUserAttendance(null);
        setPlace((p) => p ? { ...p, attendee_count: Math.max(0, (p.attendee_count || 1) - 1) } : p);
        addToast('Presença cancelada.', 'info');
      } else {
        const { data } = await placesApi.attend(id, status);
        setUserAttendance(status);
        if (status === 'going') {
          setPlace((p) => p ? { ...p, attendee_count: data.attendee_count } : p);
        }
        addToast(status === 'going' ? '✅ Presença confirmada!' : '🤔 Marcado como talvez!', 'success');
      }
    } catch (err) {
      addToast(err.response?.data?.error || 'Erro ao confirmar presença.', 'error');
    } finally { setAttendanceLoading(false); }
  }

  async function handleOrgReview(e) {
    e?.preventDefault();
    setOrgReviewError('');
    if (!orgReviewForm.rating) { setOrgReviewError('Escolha uma nota.'); return; }
    setOrgReviewLoading(true);
    try {
      const { data } = await placesApi.reviewOrganizer(id, orgReviewForm);
      setOrgReviews((p) => [data.review, ...p]);
      setHasReviewedOrg(true);
      setOrgReviewForm({ rating: 0, comment: '' });
      addToast('Avaliação do organizador enviada!', 'success');
      // Atualiza média exibida no place
      setPlace((p) => p ? {
        ...p,
        creator: p.creator ? {
          ...p.creator,
          organizer_review_count: (p.creator.organizer_review_count || 0) + 1,
        } : p.creator,
      } : p);
    } catch (err) {
      setOrgReviewError(err.response?.data?.error || 'Erro ao avaliar.');
    } finally { setOrgReviewLoading(false); }
  }

  async function loadMoreReviews() {
    const next = revPage + 1;
    setLoadingRevs(true);
    try {
      const { data } = await reviewsApi.list(id, { page: next, limit: 10 });
      setRevPage(next); // incrementa só após sucesso para não corromper a paginação
      setReviews((p) => [...p, ...data.items]);
      setRevHasMore(data.items.length === 10);
    } catch {
      addToast('Erro ao carregar mais avaliações.', 'error');
    } finally {
      setLoadingRevs(false);
    }
  }

  async function handleDeleteReview(reviewId) {
    if (!window.confirm('Excluir esta avaliação? Esta ação não pode ser desfeita.')) return;
    setDeletingRevId(reviewId);
    try {
      await reviewsApi.remove(id, reviewId);
      setReviews((p) => p.filter((r) => r.id !== reviewId));
      seenReviewIds.current.delete(reviewId);
      if (postedReview?.id === reviewId) setPostedReview(null);
      // Atualiza stats do lugar
      const placeRes = await placesApi.get(id);
      setPlace(placeRes.data.place);
      setRatingDist(placeRes.data.rating_distribution || []);
      setInsightKey((k) => k + 1);
      addToast('Avaliação excluída.', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Erro ao excluir avaliação.', 'error');
    } finally { setDeletingRevId(null); }
  }

  async function handleEditSubmit(reviewId) {
    if (!editRating) { addToast('Escolha uma nota.', 'warning'); return; }
    if (editComment.trim().length < 10) { addToast('Comentário deve ter pelo menos 10 caracteres.', 'warning'); return; }
    setEditLoading(true);
    try {
      const { data } = await reviewsApi.update(id, reviewId, { rating: editRating, comment: editComment });
      setReviews((p) => p.map((r) => r.id === reviewId ? { ...r, ...data.review, author: r.author } : r));
      setEditingReview(null);
      // Atualiza stats
      const placeRes = await placesApi.get(id);
      setPlace(placeRes.data.place);
      setRatingDist(placeRes.data.rating_distribution || []);
      setInsightKey((k) => k + 1);
      addToast('Avaliação atualizada!', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Erro ao editar avaliação.', 'error');
    } finally { setEditLoading(false); }
  }

  function onNewReview(rev) {
    seenReviewIds.current.add(rev.id);
    setReviews((p) => [rev, ...p]);
    setNewReviewIds((s) => new Set([...s, rev.id]));
    setPlace((p) => p ? {
      ...p,
      avg_rating: (((parseFloat(p.avg_rating || 0) * (p.review_count || 0)) + rev.rating) / ((p.review_count || 0) + 1)).toFixed(1),
      review_count: (p.review_count || 0) + 1,
    } : p);
    // Remove o marcador "novo" após 3s para parar a animação
    setTimeout(() => setNewReviewIds((s) => { const next = new Set(s); next.delete(rev.id); return next; }), 3000);
    // Sem author = veio do HTTP 201 (review do próprio usuário); socket traz author
    if (!rev.author) setPostedReview(rev);
  }

  // ── Socket.IO — tempo real ──────────────────────────────────────────────────
  const handleAlertUpdated = useCallback((data) => {
    setPlace((p) => p ? { ...p, alert_level: data.level } : p);
    if (data.alert) setActiveAlert(data.alert);
    setAlertDismissed(false);
    addToast(
      `⚠️ Nível de alerta atualizado para ${data.level === 'high' ? 'ALTO' : data.level === 'medium' ? 'MÉDIO' : 'BAIXO'}`,
      data.level === 'high' ? 'error' : data.level === 'medium' ? 'warning' : 'info'
    );
  }, [addToast]);

  const handleReviewNew = useCallback((data) => {
    if (!data.review) return;
    const rev = data.review;
    if (seenReviewIds.current.has(rev.id)) {
      // Própria review já exibida via HTTP — patcha sentimento na lista e no card de sucesso
      setReviews((prev) => prev.map((r) =>
        r.id === rev.id ? { ...r, sentiment: rev.sentiment, sentiment_score: rev.sentiment_score } : r
      ));
      setPostedReview((p) => p?.id === rev.id
        ? { ...p, sentiment: rev.sentiment, sentiment_score: rev.sentiment_score }
        : p
      );
      return;
    }
    onNewReview(rev);
    setInsightKey((k) => k + 1);
    addToast('💬 Nova avaliação adicionada em tempo real!', 'info');
  }, [addToast]);

  const handleReviewUpdated = useCallback((data) => {
    if (!data.review) return;
    setReviews((p) => p.map((r) => r.id === data.review.id ? { ...r, ...data.review } : r));
    setInsightKey((k) => k + 1);
  }, []);

  const handleReviewDeleted = useCallback((data) => {
    if (!data.reviewId) return;
    setReviews((p) => p.filter((r) => r.id !== data.reviewId));
    seenReviewIds.current.delete(data.reviewId);
    setInsightKey((k) => k + 1);
  }, []);

  const { joinPlace, leavePlace } = useSocket({
    token,
    onAlertUpdated:  handleAlertUpdated,
    onReviewNew:     handleReviewNew,
    onReviewUpdated: handleReviewUpdated,
    onReviewDeleted: handleReviewDeleted,
  });

  // Socket do useSocket — atualiza a UI do lugar (review list, alertas)
  useEffect(() => {
    if (id) {
      joinPlace(Number(id));
      return () => leavePlace(Number(id));
    }
  }, [id, joinPlace, leavePlace]);

  // Socket do NotificationsContext — alimenta o sino de notificações
  const { joinPlace: notifJoin, leavePlace: notifLeave } = useNotifications();
  useEffect(() => {
    if (id) {
      notifJoin(Number(id));
      return () => notifLeave(Number(id));
    }
  }, [id, notifJoin, notifLeave]);

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return <Spinner center size="lg" dark />;
  if (!place)  return null;

  const color     = CAT_COLORS[place.category] || '#5B4FE8';
  const userAlreadyReviewed = isAuthenticated && !!user?.id && reviews.some((r) => r.author?.id === user.id);
  const avgRating = parseFloat(place.avg_rating || 0);
  const alertLevel = place.alert_level;
  const isOrganizer = isAuthenticated && place.created_by === user?.id;

  const isFinished = (() => {
    if (place.type !== 'event' || place.is_fixed || !place.event_date) return false;
    const todayBrasilia = new Date()
      .toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
      .split('/').reverse().join('-');
    return place.event_date < todayBrasilia;
  })();

  const distTotal = ratingDist.reduce((s, r) => s + Number(r.count), 0);
  const dist = [5,4,3,2,1].map((n) => {
    const entry = ratingDist.find((r) => Number(r.rating) === n);
    return { n, count: entry ? Number(entry.count) : 0 };
  });

  return (
    <div className="screen">
      <Navbar />

      {/* ── AlertBanner: visível e animado ── */}
      {alertLevel && alertLevel !== 'none' && !alertDismissed && (
        <div className="alert-banner-wrapper">
          <AlertBanner
            level={alertLevel}
            alert={activeAlert}
            onDismiss={() => setAlertDismissed(true)}
          />
        </div>
      )}

      {/* ── Hero ── */}
      <div className="detail-hero">
        {place.image_url && !heroImgError
          ? <img src={place.image_url} alt={place.name} onError={() => setHeroImgError(true)} />
          : <div className="detail-hero-ph" style={{ background: `${color}22` }}>
              <MapPin size={40} color={color} />
            </div>}
        <button className="detail-back" onClick={() => navigate(-1)} aria-label="Voltar">
          <ArrowLeft size={18} />
        </button>
        {place.image_url && !heroImgError && place.image_credit && (
          <span className="detail-hero-credit">Foto: {place.image_credit}</span>
        )}
      </div>

      {/* ── Conteúdo ── */}
      <div className="detail-content">

        {/* Cabeçalho */}
        <div className="detail-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="detail-cat" style={{ background: color }}>{categoryLabel(place.category)}</span>
            {alertLevel && alertLevel !== 'none' && (
              <span style={{ fontSize: 12 }}>
                {alertLevel === 'high' ? '🔴' : alertLevel === 'medium' ? '🟡' : '🔵'}
                {' '}{alertLevel === 'high' ? 'Alerta alto' : alertLevel === 'medium' ? 'Alerta médio' : 'Alerta baixo'}
              </span>
            )}
          </div>
          <h1 className="detail-name">{place.name}</h1>
          {place.address && (
            <p className="detail-addr"><MapPin size={13} /> {place.address}</p>
          )}

          <div className="detail-rating-row">
            <span className="detail-rating-num">{avgRating > 0 ? avgRating.toFixed(1) : '—'}</span>
            <StarRating value={Math.round(avgRating)} size={18} readonly />
            <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>
              ({place.review_count} avaliações)
            </span>
          </div>

          <div className="detail-actions">
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`, '_blank', 'noopener')}
            >
              <Navigation size={15} /> Como chegar
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: place.name, url: window.location.href });
                } else {
                  navigator.clipboard?.writeText(window.location.href);
                  addToast('Link copiado!', 'success');
                }
              }}
            >
              <Share2 size={15} /> Compartilhar
            </button>
            {isOrganizer && (
              <button
                className="btn btn--sm"
                style={{ color: 'var(--danger)', background: 'var(--danger-light)', border: 'none' }}
                onClick={handleDelete}
                disabled={deleting}
                title="Excluir evento"
              >
                <Trash2 size={15} /> {deleting ? 'Excluindo…' : 'Excluir evento'}
              </button>
            )}
          </div>
        </div>

        {/* ── Seção de Evento ── */}
        {place.type === 'event' && (
          <div className="event-info-section">

            {/* Badge encerrado */}
            {isFinished && (
              <div className="event-finished-banner">
                🔒 Este evento já foi encerrado
              </div>
            )}

            {/* Data e vagas */}
            <div className="event-meta-row">
              {place.event_date && (
                <div className="event-meta-chip" style={isFinished ? { opacity: 0.6 } : {}}>
                  <Calendar size={14} />
                  <span style={isFinished ? { textDecoration: 'line-through' } : {}}>
                    {new Date(place.event_date + 'T00:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' })}
                  </span>
                </div>
              )}
              {place.event_start_time && (
                <div className="event-meta-chip">
                  <Clock size={14} />
                  <span>
                    {place.event_start_time.slice(0, 5)}
                    {place.event_end_time ? ` – ${place.event_end_time.slice(0, 5)}` : ''}
                  </span>
                </div>
              )}
              <div className="event-meta-chip">
                <Users size={14} />
                <span>
                  <strong>{place.attendee_count || 0}</strong> {isFinished ? 'foram' : 'confirmados'}
                  {place.max_attendees ? ` / ${place.max_attendees} vagas` : ''}
                </span>
              </div>
            </div>

            {/* Botões de presença — ocultos se encerrado */}
            {!isOrganizer && !isFinished && (
              <div className="event-attend-row">
                <button
                  className={`btn btn--sm ${userAttendance === 'going' ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => handleAttend('going')}
                  disabled={attendanceLoading}
                >
                  <CheckCircle size={14} />
                  {userAttendance === 'going' ? 'Vou! (cancelar)' : 'Vou!'}
                </button>
                <button
                  className={`btn btn--sm ${userAttendance === 'maybe' ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => handleAttend('maybe')}
                  disabled={attendanceLoading}
                >
                  <Clock size={14} />
                  {userAttendance === 'maybe' ? 'Talvez (cancelar)' : 'Talvez'}
                </button>
              </div>
            )}

            {/* Preview de participantes */}
            {attendeesPreview.length > 0 && (
              <div className="event-attendees-preview">
                <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>Quem vai:</span>
                <div className="event-attendees-avatars">
                  {attendeesPreview.map((a) => a && (
                    <div key={a.id} title={a.name} className="event-attendee-avatar">
                      {a.avatar_url
                        ? <img src={a.avatar_url} alt={a.name} />
                        : <div className="event-attendee-initials">{a.name?.[0]?.toUpperCase()}</div>}
                    </div>
                  ))}
                  {(place.attendee_count || 0) > attendeesPreview.length && (
                    <div className="event-attendee-more">+{place.attendee_count - attendeesPreview.length}</div>
                  )}
                </div>
              </div>
            )}

            {/* Card do Organizador */}
            {place.creator && (
              <div className="organizer-card">
                <div className="organizer-card__header">
                  <UserCircle2 size={14} style={{ color: 'var(--primary)' }} />
                  <span className="organizer-card__label">Organizador</span>
                </div>
                <div className="organizer-card__body">
                  <Avatar user={place.creator} size={42} />
                  <div className="organizer-card__info">
                    <strong>{place.creator.name}</strong>
                    {place.creator.city && <span style={{ fontSize: 12, color: 'var(--gray-500)' }}><MapPin size={11} /> {place.creator.city}</span>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <StarRating value={Math.round(parseFloat(place.creator.avg_organizer_rating || 0))} size={13} readonly />
                      <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                        {parseFloat(place.creator.avg_organizer_rating || 0) > 0
                          ? `${parseFloat(place.creator.avg_organizer_rating).toFixed(1)} (${place.creator.organizer_review_count} avaliações como organizador)`
                          : 'Sem avaliações como organizador ainda'}
                      </span>
                    </div>
                    {place.creator.bio && <p style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 4 }}>{place.creator.bio}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Prompt pós-evento: avalie o organizador */}
            {isFinished && place.creator && place.created_by !== user?.id && isAuthenticated && (
              hasReviewedOrg ? (
                <div className="org-review-prompt org-review-prompt--done">
                  <Star size={16} fill="#F59E0B" stroke="none" />
                  <span>Obrigado por avaliar o organizador!</span>
                </div>
              ) : (
                <div className="org-review-prompt">
                  <p className="org-review-prompt__title">O evento acabou — como foi a organização?</p>
                  {orgReviewError && (
                    <div className="alert alert--error" style={{ marginBottom: 8, fontSize: 13 }}>{orgReviewError}</div>
                  )}
                  <StarRating
                    value={orgReviewForm.rating}
                    size={26}
                    onChange={(v) => setOrgReviewForm((p) => ({ ...p, rating: v }))}
                  />
                  <textarea
                    className="field__input"
                    rows={2}
                    placeholder="Comente sobre organização, comunicação, pontualidade… (opcional)"
                    value={orgReviewForm.comment}
                    onChange={(e) => setOrgReviewForm((p) => ({ ...p, comment: e.target.value }))}
                    style={{ resize: 'vertical', marginTop: 10 }}
                  />
                  <button
                    className="btn btn--primary btn--sm"
                    style={{ marginTop: 8 }}
                    onClick={handleOrgReview}
                    disabled={orgReviewLoading || !orgReviewForm.rating}
                  >
                    {orgReviewLoading ? 'Enviando…' : 'Enviar avaliação'}
                  </button>
                </div>
              )
            )}
          </div>
        )}

        {/* Distribuição de estrelas */}
        {place.review_count > 0 && (
          <div className="rating-dist">
            {dist.map(({ n, count }) => {
              const pct = distTotal ? Math.round((count / distTotal) * 100) : 0;
              return (
                <div key={n} className="rating-dist__row">
                  <span>{n} <Star size={11} fill="#F59E0B" stroke="none" /></span>
                  <div className="rating-dist__bar">
                    <div className="rating-dist__fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span>{count}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Descrição */}
        {place.description && (
          <p className="detail-desc">{place.description}</p>
        )}

        {/* Badge de segurança IA — colapsável, para todos os visitantes */}
        <SafetyClassification placeId={id} place={place} refreshKey={insightKey} />

        {/* Mini mapa */}
        <div className="mini-map-wrap">
          <MapContainer
            center={[parseFloat(place.latitude), parseFloat(place.longitude)]}
            zoom={14}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            scrollWheelZoom={false}
            dragging={false}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker
              position={[parseFloat(place.latitude), parseFloat(place.longitude)]}
              icon={placeMarkerIcon(color)}
            >
              <Popup>{place.name}</Popup>
            </Marker>
          </MapContainer>
        </div>

        {/* ── Abas ── */}
        <div className="detail-tabs">
          {[
            'reviews',
            'posts',
            'insights',
            ...(place.type === 'event' ? ['organizer'] : []),
            ...(isOrganizer && place.type === 'event' ? ['dashboard'] : []),
          ].map((t) => (
            <button
              key={t}
              className={`detail-tab${tab === t ? ' detail-tab--active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'reviews'   ? `Avaliações (${place.review_count})` :
               t === 'posts'     ? `Posts (${posts.length})` :
               t === 'organizer' ? `⭐ Organizador` :
               t === 'dashboard' ? `📊 Dashboard` :
               '🤖 IA'}
            </button>
          ))}
        </div>

        {/* ── Avaliações ── */}
        {tab === 'reviews' && (
          <div className="detail-tab-pane">
            {(postedReview || userAlreadyReviewed) ? (
              <div style={{
                display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10,
                padding: '12px 16px', marginBottom: 16,
                background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: 8,
              }}>
                <p style={{ margin: 0, color: '#065F46', fontWeight: 500 }}>
                  ✅ {postedReview
                    ? 'Sua avaliação foi enviada. Obrigado pelo feedback!'
                    : 'Você já avaliou este lugar.'}
                </p>
                {postedReview?.sentiment && (
                  <SentimentBadge sentiment={postedReview.sentiment} score={postedReview.sentiment_score} />
                )}
              </div>
            ) : (
              <ReviewForm placeId={id} onSuccess={onNewReview} />
            )}
            <div className="reviews-list">
              {reviews.map((r) => (
                <div
                  key={r.id}
                  className={`review-item${newReviewIds.has(r.id) ? ' review-item--new' : ''}`}
                >
                  <Avatar user={r.author} size={36} />
                  <div className="review-item__body">
                    {editingReview?.id === r.id ? (
                      <form onSubmit={(e) => { e.preventDefault(); handleEditSubmit(r.id); }}>
                        <div style={{ marginBottom: 8 }}>
                          <StarRating value={editRating} size={20} onChange={setEditRating} />
                        </div>
                        <textarea
                          className="field__input"
                          rows={3}
                          value={editComment}
                          onChange={(e) => setEditComment(e.target.value)}
                          style={{ resize: 'vertical', marginBottom: 8, width: '100%' }}
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="submit" className="btn btn--primary btn--sm" disabled={editLoading}>
                            {editLoading ? <Spinner /> : 'Salvar'}
                          </button>
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditingReview(null)}>
                            Cancelar
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="review-item__header">
                          <strong>{r.author?.name || 'Usuário'}</strong>
                          <StarRating value={r.rating} size={13} readonly />
                          <SentimentBadge
                            sentiment={r.sentiment}
                            score={r.sentiment_score}
                            isNew={newReviewIds.has(r.id)}
                          />
                          <span className="review-item__date">
                            {(() => { const d = new Date(r.createdAt ?? r.created_at); return isNaN(d) ? '' : formatDistanceToNow(d, { locale: ptBR, addSuffix: true }); })()}
                          </span>
                          {isAuthenticated && user?.id === r.author?.id && (
                            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                              <button
                                className="btn btn--ghost btn--sm"
                                style={{ padding: '2px 8px', fontSize: 12 }}
                                onClick={() => { setEditingReview(r); setEditRating(r.rating); setEditComment(r.comment); }}
                              >
                                <Pencil size={12} /> Editar
                              </button>
                              <button
                                className="btn btn--ghost btn--sm"
                                style={{ padding: '2px 8px', fontSize: 12, color: 'var(--danger)' }}
                                onClick={() => handleDeleteReview(r.id)}
                                disabled={deletingRevId === r.id}
                              >
                                <Trash2 size={12} /> {deletingRevId === r.id ? '…' : 'Excluir'}
                              </button>
                            </div>
                          )}
                        </div>
                        {r.comment && <p className="review-item__comment">{r.comment}</p>}
                      </>
                    )}
                  </div>
                </div>
              ))}
              {revHasMore && (
                <button className="btn btn--ghost btn--sm" onClick={loadMoreReviews} disabled={loadingRevs}>
                  {loadingRevs ? <Spinner dark /> : 'Carregar mais avaliações'}
                </button>
              )}
              {reviews.length === 0 && (
                <p style={{ color: 'var(--gray-400)', textAlign: 'center', padding: '24px 0' }}>
                  Seja o primeiro a avaliar este lugar!
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Posts ── */}
        {tab === 'posts' && (
          <div className="detail-tab-pane">
            {posts.length === 0 ? (
              <p style={{ color: 'var(--gray-400)', textAlign: 'center', padding: '24px 0' }}>
                Nenhum post sobre este lugar ainda.
              </p>
            ) : (
              <div className="posts-list">
                {posts.map((post) => (
                  <div key={post.id} className="post-card">
                    <div className="post-card__header">
                      <Avatar user={post.author} size={34} />
                      <div>
                        <strong>{post.author?.name}</strong>
                        <span className="post-card__date">
                          {(() => { const d = new Date(post.createdAt ?? post.created_at); return isNaN(d) ? '' : formatDistanceToNow(d, { locale: ptBR, addSuffix: true }); })()}
                        </span>
                      </div>
                    </div>
                    <h4 className="post-card__title">{post.title}</h4>
                    <p className="post-card__body">{post.content}</p>
                    {post.image_url && (
                      <img src={post.image_url} alt={post.title} className="post-card__img" loading="lazy" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Análise IA ── */}
        {tab === 'insights' && (
          <div className="detail-tab-pane">
            <SafetyClassification placeId={id} place={place} refreshKey={insightKey} />
            <AIInsights placeId={id} refreshKey={insightKey} />
          </div>
        )}

        {/* ── Avaliações do Organizador ── */}
        {tab === 'organizer' && (
          <div className="detail-tab-pane">
            {/* Formulário para avaliar */}
            {isAuthenticated && !hasReviewedOrg && place.created_by !== user?.id ? (
              <form className="org-review-form" onSubmit={handleOrgReview}>
                <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Avalie o organizador deste evento</h4>
                {orgReviewError && <div className="alert alert--error" style={{ marginBottom: 8 }}>{orgReviewError}</div>}
                <div style={{ marginBottom: 8 }}>
                  <StarRating
                    value={orgReviewForm.rating}
                    size={24}
                    onChange={(v) => setOrgReviewForm((p) => ({ ...p, rating: v }))}
                  />
                </div>
                <textarea
                  className="field__input"
                  rows={3}
                  placeholder="Comente sobre a organização, comunicação, pontualidade… (opcional)"
                  value={orgReviewForm.comment}
                  onChange={(e) => setOrgReviewForm((p) => ({ ...p, comment: e.target.value }))}
                  style={{ resize: 'vertical', marginBottom: 8 }}
                />
                <button type="submit" className="btn btn--primary btn--sm" disabled={orgReviewLoading}>
                  {orgReviewLoading ? <Spinner /> : 'Enviar avaliação'}
                </button>
              </form>
            ) : isAuthenticated && hasReviewedOrg ? (
              <p style={{ color: '#065F46', fontWeight: 500, fontSize: 13, marginBottom: 12 }}>
                ✅ Você já avaliou o organizador deste evento.
              </p>
            ) : !isAuthenticated ? (
              <p style={{ color: 'var(--gray-400)', fontSize: 13, marginBottom: 12 }}>
                Faça login para avaliar o organizador.
              </p>
            ) : null}

            {/* Lista de avaliações do organizador */}
            <div className="reviews-list" style={{ marginTop: 16 }}>
              {orgReviews.length === 0 ? (
                <p style={{ color: 'var(--gray-400)', textAlign: 'center', padding: '24px 0' }}>
                  Nenhuma avaliação do organizador ainda.
                </p>
              ) : (
                orgReviews.map((r) => (
                  <div key={r.id} className="review-item">
                    <Avatar user={r.reviewer} size={36} />
                    <div className="review-item__body">
                      <div className="review-item__header">
                        <strong>{r.reviewer?.name || 'Usuário'}</strong>
                        <StarRating value={r.rating} size={13} readonly />
                        <span className="review-item__date">
                          {(() => { const d = new Date(r.createdAt ?? r.created_at); return isNaN(d) ? '' : formatDistanceToNow(d, { locale: ptBR, addSuffix: true }); })()}
                        </span>
                      </div>
                      {r.event && <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>Evento: {r.event.name}</span>}
                      {r.comment && <p className="review-item__comment">{r.comment}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {/* ── Dashboard do Organizador ── */}
        {tab === 'dashboard' && isOrganizer && (
          <div className="detail-tab-pane">
            <OrganizerDashboard placeId={id} place={place} />
          </div>
        )}

      </div>

      <BottomNav />
    </div>
  );
}
