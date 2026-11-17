import { useState } from 'react';
import { Star } from 'lucide-react';

export default function StarRating({ value = 0, onChange, size = 20, readonly = false }) {
  const [hover, setHover] = useState(null);
  const active = hover ?? value;

  return (
    <div style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => !readonly && onChange?.(n)}
          onMouseEnter={() => !readonly && setHover(n)}
          onMouseLeave={() => !readonly && setHover(null)}
          style={{
            background: 'none', border: 'none', padding: 2,
            cursor: readonly ? 'default' : 'pointer',
            transition: 'transform .1s',
            transform: !readonly && hover === n ? 'scale(1.2)' : 'none',
          }}
          tabIndex={readonly ? -1 : 0}
          aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
        >
          <Star
            size={size}
            fill={active >= n ? '#F59E0B' : 'none'}
            stroke={active >= n ? '#F59E0B' : '#D1D5DB'}
          />
        </button>
      ))}
    </div>
  );
}
