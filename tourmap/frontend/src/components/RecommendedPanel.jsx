import { useState, useEffect } from 'react';
import { Sparkles, Star } from 'lucide-react';
import { places as placesApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Spinner from './Spinner';

// Logado: personalizado pelo histórico de avaliações. Visitante: mais bem avaliados.
export default function RecommendedPanel({ onSelectPlace }) {
  const { token } = useAuth();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    placesApi.recommended({ limit: 5 })
      .then(({ data }) => { if (active) setData(data); })
      .catch(() => { if (active) setData(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  if (!loading && !data?.items?.length) return null;

  return (
    <div className="ranking-panel">
      <div className="ranking-panel__header">
        <Sparkles size={16} color="var(--primary)" />
        <h3>{data?.personalized ? 'Recomendados para você' : 'Sugestões para começar'}</h3>
      </div>
      {!data?.personalized && !loading && (
        <p style={{ margin: 0, fontSize: 11, color: 'var(--gray-400)' }}>
          {token ? 'Avalie alguns lugares para receber sugestões personalizadas.' : 'Entre e avalie lugares para receber sugestões personalizadas.'}
        </p>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}><Spinner dark /></div>
      ) : (
        <ol className="ranking-list">
          {data.items.map((place) => (
            <li
              key={place.id}
              className="ranking-item"
              onClick={() => onSelectPlace?.(place)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelectPlace?.(place)}
            >
              <div className="ranking-item__info">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span className="ranking-item__name">{place.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                    <Star size={10} fill="#F59E0B" stroke="#F59E0B" />
                    {parseFloat(place.avg_rating || 0).toFixed(1)}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--primary)' }}>{place.reason}</span>
                {place.city && <span style={{ fontSize: 10, color: 'var(--gray-400)' }}>{place.city}</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
