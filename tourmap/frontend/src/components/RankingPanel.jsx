import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, TrendingUp, MapPin, RefreshCw, ChevronRight } from 'lucide-react';
import { places as placesApi } from '../services/api';
import Spinner from './Spinner';

const TYPE_OPTIONS = [
  { value: 'all',     label: 'Todos' },
  { value: 'event',   label: 'Eventos' },
  { value: 'tourist', label: 'Turísticos' },
];

const CITY_OPTIONS = [
  { value: '',              label: 'Todas' },
  { value: 'São Paulo',     label: 'SP' },
  { value: 'Rio de Janeiro',label: 'RJ' },
  { value: 'Belo Horizonte',label: 'BH' },
  { value: 'Curitiba',      label: 'Curitiba' },
  { value: 'Salvador',      label: 'Salvador' },
  { value: 'Fortaleza',     label: 'Fortaleza' },
];

function SentimentBar({ pct, count }) {
  const color = pct >= 70 ? '#059669' : pct >= 40 ? '#F59E0B' : '#DC2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        flex: 1, height: 6, borderRadius: 3,
        background: 'var(--gray-100, #F3F4F6)', overflow: 'hidden',
      }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3,
          transition: 'width .5s ease' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color, minWidth: 32, textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  );
}

function RankBadge({ rank }) {
  const medals = ['🥇', '🥈', '🥉'];
  if (rank <= 3) return <span style={{ fontSize: 18 }}>{medals[rank - 1]}</span>;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 24, height: 24, borderRadius: '50%',
      background: 'var(--gray-100, #F3F4F6)',
      fontSize: 11, fontWeight: 700, color: 'var(--gray-500)',
    }}>
      {rank}
    </span>
  );
}

export default function RankingPanel({ onSelectPlace }) {
  const navigate = useNavigate();
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity]       = useState('');
  const [type, setType]       = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 15, type };
      if (city) params.city = city;
      const { data } = await placesApi.ranked(params);
      setItems(data.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [city, type]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="ranking-panel">
      {/* Cabeçalho */}
      <div className="ranking-panel__header">
        <TrendingUp size={16} color="#7C3AED" />
        <h3>Ranking por Sentimento</h3>
        <button
          className="ranking-panel__refresh"
          onClick={load}
          disabled={loading}
          title="Atualizar"
        >
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {/* Filtros */}
      <div className="ranking-panel__filters">
        {/* Tipo */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TYPE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              className={`cat-pill cat-pill--sm${type === value ? ' cat-pill--active' : ''}`}
              style={{ '--pill-color': '#7C3AED', fontSize: 11 }}
              onClick={() => setType(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Cidade */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--gray-400)', marginRight: 2 }}>
            <MapPin size={10} style={{ verticalAlign: 'middle' }} /> Cidade:
          </span>
          {CITY_OPTIONS.map(({ value, label }) => (
            <button
              key={value || 'all'}
              className={`cat-pill cat-pill--sm${city === value ? ' cat-pill--active' : ''}`}
              style={{ '--pill-color': '#0284C7', fontSize: 11 }}
              onClick={() => setCity(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <Spinner dark />
        </div>
      ) : items.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--gray-400)', fontSize: 13, padding: '24px 0' }}>
          Nenhum lugar com avaliações analisadas.
        </p>
      ) : (
        <ol className="ranking-list">
          {items.map((place, i) => (
            <li
              key={place.id}
              className="ranking-item"
              onClick={() => onSelectPlace?.(place)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelectPlace?.(place)}
            >
              <div className="ranking-item__rank">
                <RankBadge rank={i + 1} />
              </div>

              <div className="ranking-item__info">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="ranking-item__name">{place.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Star size={10} fill="#F59E0B" stroke="#F59E0B" />
                    {parseFloat(place.avg_rating || 0).toFixed(1)}
                  </span>
                </div>

                <SentimentBar pct={place.positive_pct} count={place.analyzed_reviews} />

                <div style={{ display: 'flex', justify: 'space-between', alignItems: 'center', marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: 'var(--gray-400)' }}>
                    {place.analyzed_reviews} avaliações analisadas
                    {place.city ? ` · ${place.city}` : ''}
                  </span>
                  <button
                    className="btn btn--ghost btn--sm"
                    style={{ fontSize: 10, padding: '2px 6px', marginLeft: 'auto' }}
                    onClick={(e) => { e.stopPropagation(); navigate(`/places/${place.id}`); }}
                  >
                    Ver <ChevronRight size={10} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
