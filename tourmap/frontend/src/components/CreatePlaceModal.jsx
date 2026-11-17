import { useState, useEffect, useRef } from 'react';
import { X, MapPin, Music, Palette, Dumbbell, UtensilsCrossed, Leaf, Theater, Search } from 'lucide-react';
import { places as placesApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Spinner from './Spinner';

const CATEGORIES = [
  { value: 'musica',      label: 'Música',       Icon: Music,          color: '#5B4FE8' },
  { value: 'cultura',     label: 'Cultura',       Icon: Theater,        color: '#EC4899' },
  { value: 'esporte',     label: 'Esporte',       Icon: Dumbbell,       color: '#10B981' },
  { value: 'gastronomia', label: 'Gastronomia',   Icon: UtensilsCrossed, color: '#F59E0B' },
  { value: 'natureza',    label: 'Natureza',      Icon: Leaf,           color: '#06B6D4' },
  { value: 'arte',        label: 'Arte',          Icon: Palette,        color: '#8B5CF6' },
];

async function searchNominatim(query) {
  if (!query.trim()) return [];
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=br&accept-language=pt-BR`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'TourMap/1.0' } });
    return await res.json();
  } catch {
    return [];
  }
}

export default function CreatePlaceModal({ latlng, onClose, onCreated }) {
  const { isAuthenticated } = useAuth();
  const debounceRef = useRef(null);

  const [form, setForm] = useState({
    name: '',
    category: '',
    description: '',
    address: '',
    is_free: true,
    latitude:    latlng?.lat ?? '',
    longitude:   latlng?.lng ?? '',
    event_date:  '',
    max_attendees: '',
  });
  const [suggestions, setSuggestions] = useState([]);
  const [loadingGeo, setLoadingGeo]   = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  // Se veio com coordenadas do clique no mapa, busca o endereço automaticamente
  useEffect(() => {
    if (!latlng?.lat || !latlng?.lng) return;
    setLoadingGeo(true);
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latlng.lat}&lon=${latlng.lng}&format=json&accept-language=pt-BR`;
    fetch(url, { headers: { 'User-Agent': 'TourMap/1.0' } })
      .then((r) => r.json())
      .then((data) => {
        if (data?.display_name) {
          setForm((p) => ({ ...p, address: data.display_name }));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingGeo(false));
  }, []);

  function set(field, value) {
    setForm((p) => ({ ...p, [field]: value }));
    setError('');
  }

  // ── Busca de endereço com debounce ────────────────────────────────────────
  function handleAddressChange(val) {
    set('address', val);
    clearTimeout(debounceRef.current);
    if (val.trim().length < 4) { setSuggestions([]); return; }
    setLoadingGeo(true);
    debounceRef.current = setTimeout(async () => {
      const results = await searchNominatim(val);
      setSuggestions(results);
      setLoadingGeo(false);
    }, 500);
  }

  function selectSuggestion(item) {
    setForm((p) => ({
      ...p,
      address:   item.display_name,
      latitude:  parseFloat(item.lat),
      longitude: parseFloat(item.lon),
    }));
    setSuggestions([]);
  }

  // ── Validação ─────────────────────────────────────────────────────────────
  function validate() {
    if (!form.name.trim())     return setError('Informe o nome do lugar.'), false;
    if (!form.category)        return setError('Selecione uma categoria.'), false;
    if (!form.latitude || !form.longitude)
      return setError('Informe ou selecione uma localização no mapa.'), false;
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    if (isNaN(lat) || lat < -33.75 || lat > 5.28)
      return setError('Latitude inválida para o Brasil.'), false;
    if (isNaN(lng) || lng < -73.98 || lng > -34.79)
      return setError('Longitude inválida para o Brasil.'), false;
    return true;
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    if (!isAuthenticated) return setError('Você precisa estar logado.'), undefined;
    if (!validate()) return;

    setLoading(true);
    try {
      const { data } = await placesApi.create({
        name:          form.name.trim(),
        category:      form.category,
        description:   form.description.trim() || null,
        address:       form.address.trim() || null,
        latitude:      parseFloat(form.latitude),
        longitude:     parseFloat(form.longitude),
        is_free:       form.is_free,
        event_date:    form.event_date || null,
        max_attendees: form.max_attendees ? parseInt(form.max_attendees, 10) : null,
        force_event:   true,
      });
      onCreated?.(data.place);
    } catch (err) {
      const body = err.response?.data;
      setError(body?.error || (body?.details?.[0]) || 'Erro ao criar lugar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        {/* Header */}
        <div className="modal__header">
          <h2 className="modal__title">
            <MapPin size={18} color="var(--primary)" /> Novo Evento
          </h2>
          <button className="modal__close" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <form className="modal__body" onSubmit={handleSubmit}>

          {error && (
            <div className="alert alert--error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* Nome */}
          <div className="field">
            <label className="field__label">Nome do lugar *</label>
            <input className="field__input" placeholder="Ex: Praia do Futuro"
              value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
          </div>

          {/* Categoria */}
          <div className="field">
            <label className="field__label">Categoria *</label>
            <div className="category-grid">
              {CATEGORIES.map(({ value, label, Icon, color }) => (
                <button
                  key={value} type="button"
                  className={`category-card${form.category === value ? ' category-card--selected' : ''}`}
                  style={{ '--cat-color': color }}
                  onClick={() => set('category', value)}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Endereço — preenchido automaticamente se vier do mapa, editável caso contrário */}
          <div className="field" style={{ position: 'relative' }}>
            <label className="field__label">Endereço</label>
            <div className="field__input-wrapper">
              <input
                className="field__input"
                placeholder="Digite para buscar ou clique no mapa…"
                value={form.address}
                onChange={(e) => handleAddressChange(e.target.value)}
                autoComplete="off"
              />
              <span className="field__input-action">
                {loadingGeo ? <Spinner dark size="sm" /> : <Search size={15} />}
              </span>
            </div>
            {latlng && form.address && !loadingGeo && (
              <p style={{ fontSize: 12, color: 'var(--success)', marginTop: 4 }}>
                ✓ Localização obtida do mapa
              </p>
            )}
            {suggestions.length > 0 && (
              <ul className="address-suggestions">
                {suggestions.map((s, i) => (
                  <li key={i} onClick={() => selectSuggestion(s)}>
                    <MapPin size={12} />
                    <span>{s.display_name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Coordenadas — exibidas só se não vieram do mapa (usuário precisa informar) */}
          {!latlng && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label className="field__label">Latitude *</label>
                <input className="field__input" type="number" step="any"
                  placeholder="-23.5505"
                  value={form.latitude}
                  onChange={(e) => set('latitude', e.target.value)} />
              </div>
              <div className="field">
                <label className="field__label">Longitude *</label>
                <input className="field__input" type="number" step="any"
                  placeholder="-46.6333"
                  value={form.longitude}
                  onChange={(e) => set('longitude', e.target.value)} />
              </div>
            </div>
          )}

          {/* Data do evento */}
          <div className="field">
            <label className="field__label">Data do evento</label>
            <input className="field__input" type="date"
              value={form.event_date}
              onChange={(e) => set('event_date', e.target.value)}
              min={new Date().toISOString().split('T')[0]} />
          </div>

          {/* Limite de vagas */}
          <div className="field">
            <label className="field__label">Limite de participantes (opcional)</label>
            <input className="field__input" type="number"
              placeholder="Deixe vazio para ilimitado"
              min={1}
              value={form.max_attendees}
              onChange={(e) => set('max_attendees', e.target.value)} />
          </div>

          {/* Descrição */}
          <div className="field">
            <label className="field__label">Descrição</label>
            <textarea
              className="field__input"
              rows={3}
              placeholder="Descreva o lugar…"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* É gratuito? */}
          <label className="checkbox-field">
            <input type="checkbox" checked={form.is_free}
              onChange={(e) => set('is_free', e.target.checked)} />
            <span>Entrada gratuita</span>
          </label>

          {/* Footer */}
          <div className="modal__footer">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn--primary" disabled={loading} style={{ flex: 1 }}>
              {loading ? <Spinner /> : '📅 Criar evento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
