import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronUp, ChevronDown, Locate, Search, X, PlusCircle, CornerDownRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMap }  from '../hooks/useMap';
import { useSocket } from '../hooks/useSocket';
import { useToast }  from '../components/Toast';
import { places as placesApi, users as usersApi } from '../services/api';
import Navbar            from '../components/Navbar';
import MapView           from '../components/Map';
import PlaceCard         from '../components/PlaceCard';
import CreatePlaceModal  from '../components/CreatePlaceModal';
import RankingPanel      from '../components/RankingPanel';
import RecommendedPanel  from '../components/RecommendedPanel';

// ── Filtros de data (client-side) ────────────────────────────────────────────
const DATE_FILTERS = [
  { value: '',       label: 'Qualquer data' },
  { value: 'today',  label: 'Hoje' },
  { value: 'week',   label: 'Esta semana' },
  { value: 'month',  label: 'Este mês' },
];

function todayStr() {
  return new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('/').reverse().join('-');
}

function endOfWeekStr() {
  const d = new Date();
  const day = d.getDay(); // 0=Dom
  const diff = 6 - day;  // sábado
  d.setDate(d.getDate() + diff);
  return d.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('/').reverse().join('-');
}

function endOfMonthStr() {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('/').reverse().join('-');
}

function matchesDateFilter(place, dateFilter) {
  if (!dateFilter || place.type !== 'event' || !place.event_date) return true;
  const today = todayStr();
  const date  = place.event_date; // 'YYYY-MM-DD'
  if (dateFilter === 'today') return date === today;
  if (dateFilter === 'week')  return date >= today && date <= endOfWeekStr();
  if (dateFilter === 'month') return date >= today && date <= endOfMonthStr();
  return true;
}

// ── Categorias para os filtros ────────────────────────────────────────────────
const FILTERS = [
  { value: '',            label: 'Todos',        color: 'var(--gray-600)' },
  { value: 'musica',      label: 'Música',       color: '#5B4FE8' },
  { value: 'cultura',     label: 'Cultura',      color: '#EC4899' },
  { value: 'esporte',     label: 'Esporte',      color: '#10B981' },
  { value: 'gastronomia', label: 'Gastronomia',  color: '#F59E0B' },
  { value: 'natureza',    label: 'Natureza',     color: '#06B6D4' },
  { value: 'arte',        label: 'Arte',         color: '#8B5CF6' },
];

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { addToast } = useToast();

  const {
    places, loading,
    filters, setFilters,
    userLocation, setUserLocation, userAccuracy, setUserAccuracy, geolocate,
    selectedPlace, setSelectedPlace,
    mapRef, flyTo, reload, updatePlaceAlert,
    locationLabel, locationActive, clearLocationFilter,
  } = useMap(location.key);

  // ── Modal de criar lugar ─────────────────────────────────────────────────
  const [createModal, setCreateModal] = useState({ open: false, latlng: null });

  // ── Bottom sheet (mobile) ────────────────────────────────────────────────
  const [panelOpen, setPanelOpen] = useState(false);

  // ── Busca inline de cidade ───────────────────────────────────────────────
  const [showCitySearch, setShowCitySearch] = useState(false);
  const [citySearchQuery, setCitySearchQuery] = useState('');
  const citySearchInputRef = useRef(null);

  // ── Busca local ──────────────────────────────────────────────────────────
  const [localSearch, setLocalSearch] = useState('');

  // ── Aba ativa da sidebar ('explore' | 'ranking') ─────────────────────────
  const [sidebarTab, setSidebarTab] = useState('explore');

  // ── Filtro de data (client-side, só afeta eventos) ──────────────────────
  const [dateFilter, setDateFilter] = useState('');

  // ── RSVP — mapa placeId → status ('going' | 'maybe') ────────────────────
  // Usamos useRef para comparar na atualização otimista sem deps extras
  const [attendanceMap, setAttendanceMap] = useState(new Map());
  const attendanceRef = useRef(attendanceMap);
  useEffect(() => { attendanceRef.current = attendanceMap; }, [attendanceMap]);

  useEffect(() => {
    if (!isAuthenticated) { setAttendanceMap(new Map()); return; }
    usersApi.attending().then(({ data }) => {
      const m = new Map();
      data.items.forEach((ev) => m.set(ev.id, ev.user_attendance || 'going'));
      setAttendanceMap(m);
    }).catch(() => {});
  }, [isAuthenticated]);

  // ── Socket.IO ────────────────────────────────────────────────────────────
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('tourmap_token') : null;

  const handleAlertUpdated = useCallback((data) => {
    updatePlaceAlert(data.placeId, data.level);
    const levelPT = { high: 'ALTO', medium: 'MÉDIO', low: 'BAIXO', none: '' };
    if (data.level !== 'none') {
      addToast(`⚠️ Alerta ${levelPT[data.level] || ''} no lugar #${data.placeId}`, 'warning');
    }
  }, [updatePlaceAlert, addToast]);

  const handleReviewNew = useCallback((data) => {
    addToast(`Nova avaliação em "${data.review?.place?.name || 'um lugar'}"`, 'info');
  }, [addToast]);

  const { joinPlace } = useSocket({
    token,
    onAlertUpdated: handleAlertUpdated,
    onReviewNew:    handleReviewNew,
  });

  // Ao selecionar um lugar, entrar na sua sala Socket.IO
  useEffect(() => {
    if (selectedPlace) {
      joinPlace(selectedPlace.id);
      setPanelOpen(true);
    }
  }, [selectedPlace, joinPlace]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleMapClick(latlng) {
    if (!isAuthenticated) return;
    setCreateModal({ open: true, latlng });
  }

  function handleSelectPlace(place) {
    setSelectedPlace(place);
    flyTo(parseFloat(place.latitude), parseFloat(place.longitude), 14);
  }

  function handleRoute(place) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`;
    window.open(url, '_blank', 'noopener');
  }

  async function handleRsvp(placeId, status) {
    const current = attendanceRef.current.get(placeId);
    // Toggle: se já está going, cancela; senão, confirma
    if (current === status) {
      // Otimista — remove
      setAttendanceMap((prev) => { const m = new Map(prev); m.delete(placeId); return m; });
      try {
        await placesApi.unattend(placeId);
        addToast('Presença cancelada.', 'info');
      } catch {
        setAttendanceMap((prev) => { const m = new Map(prev); m.set(placeId, current); return m; });
        addToast('Erro ao cancelar presença.', 'error');
      }
    } else {
      // Otimista — adiciona
      setAttendanceMap((prev) => new Map(prev).set(placeId, status));
      try {
        await placesApi.attend(placeId, status);
        addToast('Presença confirmada! ✅', 'success');
      } catch (err) {
        const msg = err?.response?.data?.error || 'Erro ao confirmar presença.';
        setAttendanceMap((prev) => { const m = new Map(prev); m.delete(placeId); return m; });
        addToast(msg, 'error');
      }
    }
  }

  function handlePlaceCreated(place) {
    addToast('Lugar criado com sucesso! 🎉', 'success');
    setCreateModal({ open: false, latlng: null });
    reload();
    setSelectedPlace(place);
  }

  async function handleSearchCity(e) {
    e?.preventDefault();
    const q = citySearchQuery.trim();
    if (!q) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ', Brasil')}&format=json&limit=1&accept-language=pt-BR`,
        { headers: { 'User-Agent': 'TourMap/1.0' } }
      );
      const [result] = await res.json();
      if (!result) { addToast('Cidade não encontrada.', 'warning'); return; }
      const pos = [parseFloat(result.lat), parseFloat(result.lon)];
      setUserLocation(pos);
      setUserAccuracy(null); // centro da cidade, não a posição do GPS
      mapRef.current?.setView(pos, 13, { animate: true, duration: 0.6 });
      addToast(`Centralizado em ${result.display_name.split(',')[0]}`, 'success');
      setShowCitySearch(false);
      setCitySearchQuery('');
    } catch { addToast('Erro ao buscar cidade.', 'error'); }
  }

  // ── Lugares filtrados para a sidebar ─────────────────────────────────────
  const [sidebarLimit, setSidebarLimit] = useState(12);
  const filteredPlaces = dateFilter
    ? places.filter((p) => matchesDateFilter(p, dateFilter))
    : places;
  const sidebarPlaces = filteredPlaces.slice(0, sidebarLimit);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="home-layout">
      <Navbar />

      <div className="home-content">

        {/* ══ MAPA ══════════════════════════════════════════════════════════ */}
        <div className="home-map">
          <MapView
            places={places}
            userLocation={userLocation}
            userAccuracy={userAccuracy}
            selectedPlace={selectedPlace}
            onSelectPlace={handleSelectPlace}
            onMapClick={handleMapClick}
            onCreateClick={() => setCreateModal({ open: true, latlng: null })}
            mapRef={mapRef}
            isAuthenticated={isAuthenticated}
          />

          {/* Botão de geolocalização */}
          <button
            className="map-geolocate-btn"
            onClick={() => geolocate((msg) => addToast(msg, 'warning'))}
            title="Minha localização"
            aria-label="Centralizar no minha localização"
          >
            <Locate size={18} />
          </button>

          {/* FAB — criar lugar */}
          <button
            className="map-fab"
            onClick={() => isAuthenticated
              ? setCreateModal({ open: true, latlng: null })
              : navigate('/login')}
            title="Criar lugar ou evento"
            aria-label="Criar lugar ou evento"
          >
            <PlusCircle size={24} />
          </button>
        </div>

        {/* ══ PAINEL / BOTTOM SHEET ═════════════════════════════════════════ */}
        <aside className={`home-sidebar${panelOpen ? ' home-sidebar--open' : ''}`}>

          {/* Handle (mobile) */}
          <button
            className="home-sidebar__handle"
            onClick={() => setPanelOpen((v) => !v)}
            aria-label={panelOpen ? 'Minimizar painel' : 'Abrir painel'}
          >
            <div className="home-sidebar__handle-bar" />
            {panelOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>

          {/* ── Abas ── */}
          <div className="sidebar-tabs">
            <button
              className={`sidebar-tab${sidebarTab === 'explore' ? ' sidebar-tab--active' : ''}`}
              onClick={() => setSidebarTab('explore')}
            >
              Explorar
            </button>
            <button
              className={`sidebar-tab${sidebarTab === 'ranking' ? ' sidebar-tab--active' : ''}`}
              onClick={() => setSidebarTab('ranking')}
            >
              Ranking
            </button>
          </div>

          {/* ── Banner de filtro por localização ── */}
          {locationActive && locationLabel && (
            <div className="location-filter-banner">
              <span>Mostrando em: <strong>{locationLabel}</strong></span>
              <button
                className="location-filter-banner__clear"
                onClick={() => { clearLocationFilter(); setSidebarLimit(12); }}
                title="Remover filtro de localização"
              >
                × remover
              </button>
            </div>
          )}

          {/* ── Aba Explorar ── */}
          {sidebarTab === 'explore' && (
            <>
              {/* Busca */}
              <div className="sidebar-search">
                <Search size={15} className="sidebar-search__icon" />
                <input
                  type="search"
                  placeholder="Buscar lugares e eventos…"
                  value={localSearch}
                  onChange={(e) => {
                    setLocalSearch(e.target.value);
                    setFilters((f) => ({ ...f, search: e.target.value }));
                    setSidebarLimit(12);
                  }}
                  className="sidebar-search__input"
                />
                {localSearch && (
                  <button
                    onClick={() => { setLocalSearch(''); setFilters((f) => ({ ...f, search: '' })); setSidebarLimit(12); }}
                    className="sidebar-search__clear"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Pills de categoria */}
              <div className="category-pills">
                {FILTERS.map(({ value, label, color }) => (
                  <button
                    key={value}
                    className={`cat-pill${filters.category === value ? ' cat-pill--active' : ''}`}
                    style={{ '--pill-color': color }}
                    onClick={() => {
                      setFilters((f) => ({ ...f, category: value }));
                      setSidebarLimit(12);
                      setDateFilter('');
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Pills de data */}
              <div className="category-pills" style={{ paddingTop: 0, marginTop: -4 }}>
                {DATE_FILTERS.map(({ value, label }) => (
                  <button
                    key={value}
                    className={`cat-pill${dateFilter === value ? ' cat-pill--active' : ''}`}
                    style={{ '--pill-color': '#7C3AED', fontSize: 12 }}
                    onClick={() => { setDateFilter(value); setSidebarLimit(12); }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Conteúdo */}
              <div className="sidebar-content">
                {selectedPlace && (
                  <section className="sidebar-section">
                    <h2 className="sidebar-section__title">Lugar selecionado</h2>
                    <PlaceCard
                      place={selectedPlace}
                      selected
                      onSelect={handleSelectPlace}
                      onRoute={handleRoute}
                      userAttendance={attendanceMap.get(selectedPlace.id)}
                      onRsvp={handleRsvp}
                      isAuthenticated={isAuthenticated}
                    />
                  </section>
                )}

                <section className="sidebar-section">
                  <div className="sidebar-section__header">
                    <h2 className="sidebar-section__title">
                      {userLocation ? 'Perto de você' : 'Lugares'}
                    </h2>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="sidebar-section__action"
                        onClick={() => geolocate((msg) => addToast(msg, 'warning'))}
                        title="Usar GPS"
                      >
                        <Locate size={13} /> GPS
                      </button>
                      <button
                        className="sidebar-section__action"
                        onClick={() => {
                          setShowCitySearch((v) => !v);
                          setTimeout(() => citySearchInputRef.current?.focus(), 50);
                        }}
                        title="Buscar cidade"
                      >
                        <Search size={13} /> Cidade
                      </button>
                    </div>
                  </div>

                  {/* Busca inline de cidade */}
                  {showCitySearch && (
                    <form className="city-search-inline" onSubmit={handleSearchCity}>
                      <Search size={13} className="city-search-inline__icon" />
                      <input
                        ref={citySearchInputRef}
                        type="text"
                        placeholder="Ex: São Paulo, Curitiba…"
                        value={citySearchQuery}
                        onChange={(e) => setCitySearchQuery(e.target.value)}
                        className="city-search-inline__input"
                      />
                      <button
                        type="submit"
                        className="btn btn--primary btn--sm"
                        style={{ padding: '5px 10px', fontSize: 12 }}
                        disabled={!citySearchQuery.trim()}
                      >
                        <CornerDownRight size={13} />
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        style={{ padding: '5px 8px' }}
                        onClick={() => { setShowCitySearch(false); setCitySearchQuery(''); }}
                      >
                        <X size={13} />
                      </button>
                    </form>
                  )}

                  {loading ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--gray-400)' }}>
                      <div className="spinner spinner--dark spinner--lg" style={{ margin: '0 auto 10px' }} />
                      Carregando lugares…
                    </div>
                  ) : sidebarPlaces.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--gray-400)' }}>
                      Nenhum lugar encontrado.{' '}
                      {isAuthenticated && (
                        <button className="link" onClick={() => setCreateModal({ open: true, latlng: null })}>
                          Criar o primeiro!
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="places-list">
                      {sidebarPlaces.map((place) => (
                        <PlaceCard
                          key={place.id}
                          place={place}
                          selected={selectedPlace?.id === place.id}
                          onSelect={handleSelectPlace}
                          onRoute={handleRoute}
                          userAttendance={attendanceMap.get(place.id)}
                          onRsvp={handleRsvp}
                          isAuthenticated={isAuthenticated}
                        />
                      ))}
                      {sidebarLimit < filteredPlaces.length && (
                        <button
                          className="btn btn--ghost btn--sm"
                          style={{ width: '100%', marginTop: 8 }}
                          onClick={() => setSidebarLimit((l) => l + 12)}
                        >
                          Ver mais ({filteredPlaces.length - sidebarLimit} restantes)
                        </button>
                      )}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}

          {/* ── Aba Ranking ── */}
          {sidebarTab === 'ranking' && (
            <div className="sidebar-content">
              <RecommendedPanel onSelectPlace={(place) => { handleSelectPlace(place); setSidebarTab('explore'); }} />
              <RankingPanel onSelectPlace={(place) => { handleSelectPlace(place); setSidebarTab('explore'); }} />
            </div>
          )}
        </aside>
      </div>

      {/* ══ MODAL CRIAR LUGAR ═════════════════════════════════════════════════ */}
      {createModal.open && (
        <CreatePlaceModal
          latlng={createModal.latlng}
          onClose={() => setCreateModal({ open: false, latlng: null })}
          onCreated={handlePlaceCreated}
        />
      )}
    </div>
  );
}
