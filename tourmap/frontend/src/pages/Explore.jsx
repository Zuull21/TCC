import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, SlidersHorizontal, Navigation, MapPin, AlertTriangle, X } from 'lucide-react';
import Navbar      from '../components/Navbar';
import BottomNav   from '../components/BottomNav';
import StarRating  from '../components/StarRating';
import Spinner     from '../components/Spinner';
import { places as placesApi } from '../services/api';

// ── Constantes ────────────────────────────────────────────────────────────────

const CATS = [
  { value: '',            label: 'Todos'       },
  { value: 'musica',      label: '🎵 Música'   },
  { value: 'cultura',     label: '🎭 Cultura'  },
  { value: 'esporte',     label: '⚽ Esporte'  },
  { value: 'gastronomia', label: '🍽 Gastro'   },
  { value: 'natureza',    label: '🌿 Natureza' },
  { value: 'arte',        label: '🎨 Arte'     },
];

const STATES = [
  { value: '',   label: 'Todos os estados'    },
  { value: 'AC', label: 'Acre'                },
  { value: 'AL', label: 'Alagoas'             },
  { value: 'AP', label: 'Amapá'               },
  { value: 'AM', label: 'Amazonas'            },
  { value: 'BA', label: 'Bahia'               },
  { value: 'CE', label: 'Ceará'               },
  { value: 'DF', label: 'Distrito Federal'    },
  { value: 'ES', label: 'Espírito Santo'      },
  { value: 'GO', label: 'Goiás'               },
  { value: 'MA', label: 'Maranhão'            },
  { value: 'MT', label: 'Mato Grosso'         },
  { value: 'MS', label: 'Mato Grosso do Sul'  },
  { value: 'MG', label: 'Minas Gerais'        },
  { value: 'PA', label: 'Pará'                },
  { value: 'PB', label: 'Paraíba'             },
  { value: 'PR', label: 'Paraná'              },
  { value: 'PE', label: 'Pernambuco'          },
  { value: 'PI', label: 'Piauí'               },
  { value: 'RJ', label: 'Rio de Janeiro'      },
  { value: 'RN', label: 'Rio Grande do Norte' },
  { value: 'RS', label: 'Rio Grande do Sul'   },
  { value: 'RO', label: 'Rondônia'            },
  { value: 'RR', label: 'Roraima'             },
  { value: 'SC', label: 'Santa Catarina'      },
  { value: 'SP', label: 'São Paulo'           },
  { value: 'SE', label: 'Sergipe'             },
  { value: 'TO', label: 'Tocantins'           },
];

const CAT_LABELS = {
  musica: 'Música', cultura: 'Cultura', esporte: 'Esporte',
  gastronomia: 'Gastronomia', natureza: 'Natureza', arte: 'Arte',
};

const CAT_COLORS = {
  musica:'#5B4FE8', cultura:'#EC4899', esporte:'#10B981',
  gastronomia:'#F59E0B', natureza:'#06B6D4', arte:'#8B5CF6',
};

const LIMIT = 12;

// ── Lazy render: só monta o card quando entra no viewport ─────────────────────
// Mantém um placeholder da mesma altura enquanto fora de tela.
function LazyCard({ children }) {
  const ref        = useRef(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShow(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' } // pré-carrega 300px antes de chegar na tela
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ minHeight: show ? undefined : 260 }}>
      {show && children}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function Explore() {
  const navigate = useNavigate();

  const [places, setPlaces]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(1);
  const [hasMore, setHasMore]     = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // inputVal: valor imediato exibido no input (sem lag)
  // search: valor debounced que dispara a API
  const [inputVal, setInputVal]   = useState('');
  const [search, setSearch]       = useState('');
  const [category, setCategory]   = useState('');
  const [state, setState]         = useState('');
  const [isFree, setIsFree]       = useState(undefined);
  const [minRating, setMinRating] = useState(0);

  const debRef = useRef(null);

  // Dispara busca quando qualquer filtro muda
  useEffect(() => {
    setPage(1);
    setPlaces([]);
    fetchPlaces(1, true);
  }, [search, category, state, isFree, minRating]);

  async function fetchPlaces(p = 1, reset = false) {
    setLoading(true);
    const params = { page: p, limit: LIMIT };
    if (category)              params.category   = category;
    if (state)                 params.state      = state;
    if (search)                params.search     = search;
    if (isFree !== undefined)  params.is_free    = isFree;
    if (minRating)             params.min_rating = minRating;

    try {
      const { data } = await placesApi.list(params);
      setPlaces((prev) => reset ? data.items : [...prev, ...data.items]);
      setHasMore(data.items.length === LIMIT);
    } catch {
      setPlaces(reset ? [] : (prev) => prev);
    } finally {
      setLoading(false);
    }
  }

  function handleSearchInput(e) {
    const v = e.target.value;
    setInputVal(v);                       // atualiza input imediatamente
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => setSearch(v), 400); // API após 400ms
  }

  function clearSearch() {
    setInputVal('');
    setSearch('');
  }

  function clearFilters() {
    setCategory('');
    setState('');
    setIsFree(undefined);
    setMinRating(0);
    clearSearch();
  }

  function loadMore() {
    const next = page + 1;
    setPage(next);
    fetchPlaces(next);
  }

  // useCallback evita recriar a função em cada render do grid
  const openPlace = useCallback((id) => navigate(`/places/${id}`), [navigate]);

  const hasActiveFilters = category || state || isFree !== undefined || minRating > 0;

  return (
    <div className="screen">
      <Navbar />

      <div className="explore-layout">
        {/* ── Header ── */}
        <div className="explore-header">
          <div className="explore-search-row">
            <div className="explore-search-box">
              <Search size={15} />
              <input
                type="search"
                placeholder="Buscar lugares…"
                value={inputVal}
                onChange={handleSearchInput}
                className="explore-search-input"
              />
              {inputVal && (
                <button onClick={clearSearch} className="explore-search-clear">
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              className={`btn btn--ghost btn--sm${showFilters ? ' btn--active' : ''}`}
              onClick={() => setShowFilters((v) => !v)}
              style={{ gap: 5, whiteSpace: 'nowrap' }}
            >
              <SlidersHorizontal size={15} />
              Filtros {hasActiveFilters && <span className="filter-dot" />}
            </button>
          </div>

          {/* Pills de categoria */}
          <div className="category-pills" style={{ paddingLeft: 0 }}>
            {CATS.map(({ value, label }) => (
              <button
                key={value}
                className={`cat-pill${category === value ? ' cat-pill--active' : ''}`}
                style={{ '--pill-color': CAT_COLORS[value] || 'var(--gray-600)' }}
                onClick={() => setCategory(value)}
              >{label}</button>
            ))}
          </div>

          {/* Filtros adicionais */}
          {showFilters && (
            <div className="explore-filters">
              <div className="explore-filter-row">
                <span className="field__label">Estado</span>
                <select
                  className="field__input"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  style={{ maxWidth: 220, padding: '6px 10px', fontSize: 13 }}
                >
                  {STATES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="explore-filter-row">
                <span className="field__label">Entrada</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[undefined, true, false].map((v, i) => (
                    <button
                      key={i}
                      className={`cat-pill${isFree === v ? ' cat-pill--active' : ''}`}
                      style={{ '--pill-color': 'var(--primary)' }}
                      onClick={() => setIsFree(v)}
                    >
                      {v === undefined ? 'Todos' : v ? 'Gratuito' : 'Pago'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="explore-filter-row">
                <span className="field__label">Avaliação mínima</span>
                <StarRating value={minRating} onChange={setMinRating} size={20} />
              </div>

              {hasActiveFilters && (
                <button className="btn btn--ghost btn--sm" onClick={clearFilters}>
                  <X size={13} /> Limpar filtros
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Grid ── */}
        <div className="explore-content">
          {loading && places.length === 0 ? (
            <div className="explore-empty"><Spinner center dark /></div>
          ) : places.length === 0 ? (
            <div className="explore-empty">
              <div style={{ fontSize: 56 }}>🗺️</div>
              <h3>Nenhum lugar encontrado</h3>
              <p>Tente mudar os filtros ou{' '}
                <button className="link" onClick={clearFilters}>limpar a busca</button>.
              </p>
            </div>
          ) : (
            <>
              <div className="explore-grid">
                {places.map((place) => (
                  <LazyCard key={place.id}>
                    <ExploreCard place={place} onOpen={openPlace} />
                  </LazyCard>
                ))}
              </div>

              {hasMore && (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <button
                    className="btn btn--ghost"
                    onClick={loadMore}
                    disabled={loading}
                    style={{ minWidth: 160 }}
                  >
                    {loading ? <Spinner dark /> : 'Carregar mais'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

// ── Card memoizado: só re-renderiza se place ou onOpen mudarem ────────────────
const ExploreCard = memo(function ExploreCard({ place, onOpen }) {
  const isEvent   = place.type === 'event';
  const color     = isEvent ? '#7C3AED' : (CAT_COLORS[place.category] || '#5B4FE8');
  const isAlert   = place.alert_level === 'high' || place.alert_level === 'medium';
  const avgRating = parseFloat(place.avg_rating || 0);

  return (
    <div
      className="explore-card"
      onClick={() => onOpen(place.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(place.id)}
    >
      <div className="explore-card__img">
        {place.image_url
          ? <img src={place.image_url} alt={place.name} loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling.style.display = 'flex';
              }} />
          : null}
        <div className="explore-card__img-ph" style={{ background: `${color}18`, display: place.image_url ? 'none' : 'flex' }}>
          <MapPin size={28} color={color} />
        </div>

        {/* Badge tipo */}
        <span className="explore-card__badge" style={{ background: color }}>
          {isEvent ? '📅 Evento' : (CAT_LABELS[place.category] || place.category)}
        </span>

        {isAlert && (
          <span className="explore-card__alert">
            <AlertTriangle size={11} /> Alerta
          </span>
        )}
      </div>

      <div className="explore-card__body">
        <h3 className="explore-card__name">{place.name}</h3>

        {/* Criador — aparece só em eventos */}
        {isEvent && place.creator && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%',
              background: '#7C3AED22', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 11, color: '#7C3AED', fontWeight: 600,
            }}>
              {place.creator.avatar_url
                ? <img src={place.creator.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                : (place.creator.name?.[0] || 'U')}
            </div>
            <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>
              por <strong style={{ color: 'var(--gray-700)' }}>{place.creator.name}</strong>
            </span>
          </div>
        )}

        {place.city && (
          <p className="explore-card__location">
            <MapPin size={12} /> {place.city}{place.state ? `, ${place.state}` : ''}
          </p>
        )}

        {/* Avaliação — para eventos mostra "Novo" se sem avaliações */}
        <div className="explore-card__rating">
          {avgRating > 0 ? (
            <>
              <StarRating value={Math.round(avgRating)} size={14} readonly />
              <span className="explore-card__rating-val">{avgRating.toFixed(1)}</span>
              {place.review_count > 0 && (
                <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                  ({place.review_count})
                </span>
              )}
            </>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
              {isEvent ? 'Sem avaliações ainda' : '—'}
            </span>
          )}
        </div>

        {place.is_free !== undefined && (
          <span className={`explore-card__free${place.is_free ? '' : ' explore-card__free--paid'}`}>
            {place.is_free ? '🆓 Gratuito' : '💳 Pago'}
          </span>
        )}

        <div className="explore-card__actions">
          <button
            className="btn btn--primary btn--sm"
            style={{ flex: 1, fontSize: 13, background: isEvent ? '#7C3AED' : undefined }}
            onClick={(e) => { e.stopPropagation(); onOpen(place.id); }}
          >
            Ver detalhes
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={(e) => {
              e.stopPropagation();
              window.open(
                `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`,
                '_blank', 'noopener'
              );
            }}
            title="Como chegar"
          >
            <Navigation size={14} />
          </button>
        </div>
      </div>
    </div>
  );
});
