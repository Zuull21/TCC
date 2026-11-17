import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Music, Theater, Dumbbell, UtensilsCrossed, Leaf, Palette, Search, ArrowLeft, Clock } from 'lucide-react';
import { useToast } from '../components/Toast';
import { places as placesApi } from '../services/api';
import Navbar    from '../components/Navbar';
import BottomNav from '../components/BottomNav';
import Spinner   from '../components/Spinner';

const CATS = [
  { value: 'cultura',     label: 'Cultura',      Icon: Theater,         color: '#EC4899' },
  { value: 'esporte',     label: 'Esporte',      Icon: Dumbbell,        color: '#10B981' },
  { value: 'gastronomia', label: 'Gastronomia',  Icon: UtensilsCrossed, color: '#F59E0B' },
  { value: 'natureza',    label: 'Natureza',      Icon: Leaf,            color: '#06B6D4' },
  { value: 'arte',        label: 'Arte',          Icon: Palette,         color: '#8B5CF6' },
  { value: 'musica',      label: 'Música',        Icon: Music,           color: '#5B4FE8' },
];

async function nominatimSearch(q) {
  if (q.trim().length < 4) return [];
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=br&accept-language=pt-BR`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'TourMap/1.0' } });
    return r.json();
  } catch { return []; }
}

export default function CreateEvent() {
  const navigate   = useNavigate();
  const { addToast } = useToast();
  const debRef     = useRef(null);

  const [form, setForm] = useState({
    name: '', category: '', description: '', address: '',
    latitude: '', longitude: '', is_free: true, image_url: '',
    event_date: '', event_start_time: '', event_end_time: '',
    has_end_time: false, max_attendees: '',
  });
  const [suggs, setSuggs]     = useState([]);
  const [loadGeo, setLoadGeo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  function set(k, v) { setForm((p) => ({ ...p, [k]: v })); setError(''); }

  function handleAddrChange(v) {
    set('address', v);
    clearTimeout(debRef.current);
    if (v.trim().length < 4) { setSuggs([]); return; }
    setLoadGeo(true);
    debRef.current = setTimeout(async () => {
      setSuggs(await nominatimSearch(v));
      setLoadGeo(false);
    }, 500);
  }

  function pickSugg(item) {
    setForm((p) => ({ ...p, address: item.display_name, latitude: parseFloat(item.lat), longitude: parseFloat(item.lon) }));
    setSuggs([]);
  }

  function validateForm() {
    if (!form.name.trim())     { setError('Nome obrigatório.');      return false; }
    if (!form.category)        { setError('Escolha uma categoria.'); return false; }
    if (!form.latitude || !form.longitude) { setError('Selecione um endereço válido.'); return false; }
    if (form.has_end_time && form.event_start_time && form.event_end_time) {
      if (form.event_end_time <= form.event_start_time) {
        setError('O horário de término deve ser após o início.');
        return false;
      }
    }
    return true;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);
    try {
      const { data } = await placesApi.create({
        name:             form.name.trim(),
        category:         form.category,
        description:      form.description.trim() || null,
        address:          form.address.trim() || null,
        latitude:         parseFloat(form.latitude),
        longitude:        parseFloat(form.longitude),
        is_free:          form.is_free,
        image_url:        form.image_url.trim() || null,
        event_date:       form.event_date || null,
        event_start_time: form.event_start_time || null,
        event_end_time:   form.has_end_time ? (form.event_end_time || null) : null,
        max_attendees:    form.max_attendees ? parseInt(form.max_attendees, 10) : null,
        force_event:      true,
      });
      addToast('Evento publicado com sucesso!', 'success');
      navigate(`/places/${data.place.id}`);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.details?.[0] || 'Erro ao publicar.');
    } finally { setLoading(false); }
  }

  return (
    <div className="screen">
      <Navbar />

      <div className="create-layout">
        <div className="create-header">
          <button className="detail-back" style={{ position:'static', width:36, height:36 }} onClick={() => navigate(-1)}>
            <ArrowLeft size={18} />
          </button>
          <h1 className="create-title">Novo Evento</h1>
        </div>

        <form className="create-form" onSubmit={handleSubmit}>

          {error && <div className="alert alert--error">{error}</div>}

          {/* Nome */}
          <div className="field">
            <label className="field__label">Nome do evento *</label>
            <input className="field__input" placeholder="Ex: Festa Junina do Parque" autoFocus
              value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>

          {/* Categoria */}
          <div className="field">
            <label className="field__label">Categoria *</label>
            <div className="category-grid">
              {CATS.map(({ value, label, Icon, color }) => (
                <button key={value} type="button"
                  className={`category-card${form.category === value ? ' category-card--selected' : ''}`}
                  style={{ '--cat-color': color }}
                  onClick={() => set('category', value)}
                >
                  <Icon size={20} strokeWidth={1.5} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Descrição */}
          <div className="field">
            <label className="field__label">Descrição</label>
            <textarea className="field__input" rows={3} placeholder="Descreva o evento…"
              value={form.description} onChange={(e) => set('description', e.target.value)}
              style={{ resize: 'vertical' }} />
          </div>

          {/* Endereço com autocomplete */}
          <div className="field" style={{ position: 'relative' }}>
            <label className="field__label">Localização *</label>
            <div className="field__input-wrapper">
              <input className="field__input" placeholder="Buscar endereço no Brasil…"
                value={form.address} onChange={(e) => handleAddrChange(e.target.value)}
                autoComplete="off" />
              <span className="field__input-action">
                {loadGeo ? <Spinner dark /> : <Search size={15} />}
              </span>
            </div>
            {suggs.length > 0 && (
              <ul className="address-suggestions">
                {suggs.map((s, i) => (
                  <li key={i} onClick={() => pickSugg(s)}>
                    <MapPin size={12} /><span>{s.display_name}</span>
                  </li>
                ))}
              </ul>
            )}
            {form.latitude && (
              <p style={{ fontSize: 12, color: 'var(--success)', marginTop: 4 }}>
                Coordenadas confirmadas: {parseFloat(form.latitude).toFixed(5)}, {parseFloat(form.longitude).toFixed(5)}
              </p>
            )}
          </div>

          {/* Data e horário */}
          <div className="field">
            <label className="field__label">Data do evento</label>
            <input className="field__input" type="date"
              value={form.event_date} onChange={(e) => set('event_date', e.target.value)}
              min={new Date().toISOString().split('T')[0]} />
          </div>

          <div className="field">
            <label className="field__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={14} /> Horário de início
            </label>
            <input className="field__input" type="time"
              value={form.event_start_time} onChange={(e) => set('event_start_time', e.target.value)} />
          </div>

          <label className="checkbox-field">
            <input type="checkbox" checked={form.has_end_time}
              onChange={(e) => set('has_end_time', e.target.checked)} />
            <span>Definir horário de término</span>
          </label>

          {form.has_end_time && (
            <div className="field">
              <label className="field__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={14} /> Horário de término
              </label>
              <input className="field__input" type="time"
                value={form.event_end_time} onChange={(e) => set('event_end_time', e.target.value)} />
            </div>
          )}

          {/* Limite de vagas */}
          <div className="field">
            <label className="field__label">Limite de participantes (opcional)</label>
            <input className="field__input" type="number" placeholder="Deixe em branco para ilimitado"
              min={1} value={form.max_attendees} onChange={(e) => set('max_attendees', e.target.value)} />
          </div>

          {/* É gratuito */}
          <label className="checkbox-field">
            <input type="checkbox" checked={form.is_free} onChange={(e) => set('is_free', e.target.checked)} />
            <span>Entrada gratuita</span>
          </label>

          {/* URL da imagem */}
          <div className="field">
            <label className="field__label">URL da imagem (opcional)</label>
            <input className="field__input" type="url" placeholder="https://…"
              value={form.image_url} onChange={(e) => set('image_url', e.target.value)} />
          </div>

          <button type="submit" className="btn btn--primary" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? <Spinner /> : 'Publicar Evento'}
          </button>
        </form>
      </div>

      <BottomNav />
    </div>
  );
}
