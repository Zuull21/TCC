import { useState, useEffect, useCallback, useRef } from 'react';
import { places as placesApi } from '../services/api';

const DEFAULT_CENTER = [-14.235, -51.925];
const DEFAULT_ZOOM = 5;

// Nominatim retorna o nome por extenso do estado; mapeia para sigla BR
const NOMINATIM_STATE_TO_CODE = {
  'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM',
  'Bahia': 'BA', 'Ceará': 'CE', 'Distrito Federal': 'DF', 'Espírito Santo': 'ES',
  'Goiás': 'GO', 'Maranhão': 'MA', 'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS',
  'Minas Gerais': 'MG', 'Pará': 'PA', 'Paraíba': 'PB', 'Paraná': 'PR',
  'Pernambuco': 'PE', 'Piauí': 'PI', 'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN',
  'Rio Grande do Sul': 'RS', 'Rondônia': 'RO', 'Roraima': 'RR', 'Santa Catarina': 'SC',
  'São Paulo': 'SP', 'Sergipe': 'SE', 'Tocantins': 'TO',
};

async function reverseGeocodeState(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt-BR&zoom=10`,
      { headers: { 'User-Agent': 'TourMap/1.0' } }
    );
    const data = await res.json();
    const city      = data.address?.city || data.address?.town || data.address?.village || data.address?.municipality;
    const stateName = data.address?.state;
    const stateCode = NOMINATIM_STATE_TO_CODE[stateName] || null;
    return { city: city || null, stateCode, stateName: stateName || null };
  } catch {
    return { city: null, stateCode: null, stateName: null };
  }
}

export function useMap(locationKey) {
  const [places, setPlaces]             = useState([]);
  const [loading, setLoading]           = useState(false);
  const [filters, setFilters]           = useState({ category: '', search: '', is_free: undefined, radius: 50 });
  const [userLocation, setUserLocation] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [mapCenter, setMapCenter]       = useState(DEFAULT_CENTER);
  const [mapZoom, setMapZoom]           = useState(DEFAULT_ZOOM);
  const mapRef = useRef(null);

  // Filtro de localização derivado do geolocate
  const [locationLabel, setLocationLabel] = useState(null); // ex: "São Paulo, SP"
  const [locationActive, setLocationActive] = useState(false);

  // ── Distância Haversine (JS) ────────────────────────────────────────────────
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Carregar lugares da API ─────────────────────────────────────────────────
  useEffect(() => {
    const baseParams = {};
    if (filters.category)              baseParams.category = filters.category;
    if (filters.search?.trim())        baseParams.search   = filters.search.trim();
    if (filters.is_free !== undefined) baseParams.is_free  = filters.is_free;
    if (filters.state)                 baseParams.state    = filters.state;
    if (userLocation) {
      baseParams.lat    = userLocation[0];
      baseParams.lng    = userLocation[1];
      baseParams.radius = filters.radius;
    }

    setLoading(true);

    // A API devolve no máximo 50 por página: o mapa precisa de todas, senão
    // cidades inteiras ficam vazias. Limite de segurança de 10 páginas por tipo.
    async function fetchAll(type) {
      const all = [];
      for (let page = 1; page <= 10; page++) {
        const { data } = await placesApi.list({ ...baseParams, type, limit: 50, page });
        const items = data?.items || [];
        all.push(...items);
        if (items.length < 50 || all.length >= (data?.total ?? 0)) break;
      }
      return all;
    }

    Promise.all([fetchAll('tourist'), fetchAll('event')])
      .then(([touristList, eventList]) => {
        const touristItems = touristList.map((p) => ({ ...p, type: 'tourist' }));
        const eventItems   = eventList.map((p) => ({ ...p, type: 'event' }));
        let items = [...touristItems, ...eventItems];

        // Deduplica por id
        const seen = new Set();
        items = items.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });

        // Distância e ordenação se tiver localização
        if (userLocation) {
          items = items.map((p) => ({
            ...p,
            distance_km: parseFloat(
              haversine(
                userLocation[0], userLocation[1],
                parseFloat(p.latitude), parseFloat(p.longitude)
              ).toFixed(1)
            ),
          }));
          items.sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
        }

        setPlaces(items);
      })
      .catch(() => setPlaces([]))
      .finally(() => setLoading(false));
  }, [filters, userLocation, locationKey]);

  // ── Geolocalização + reverse geocode para filtro automático por estado ──────
  // A primeira leitura do navegador costuma ser grosseira (IP / Wi-Fi) e o GPS
  // refina nos segundos seguintes. Por isso acompanhamos as leituras com
  // watchPosition e ficamos com a mais precisa, atualizando o mapa a cada melhora.
  const [userAccuracy, setUserAccuracy] = useState(null);
  const watchRef = useRef(null);
  const watchTimerRef = useRef(null);

  // Zoom proporcional à precisão: rua quando ela é boa, bairro/cidade quando não
  const zoomFor = (accuracy) => (accuracy <= 50 ? 17 : accuracy <= 300 ? 16 : accuracy <= 2000 ? 14 : 12);

  function showPosition(coords) {
    const pos = [coords.latitude, coords.longitude];
    const zoom = zoomFor(coords.accuracy);
    setUserLocation(pos);
    setUserAccuracy(coords.accuracy);
    setMapCenter(pos);
    setMapZoom(zoom);
    mapRef.current?.setView(pos, zoom, { animate: true, duration: 0.6 });
  }

  async function applyStateFilter(coords) {
    const { city, stateCode, stateName } = await reverseGeocodeState(coords.latitude, coords.longitude);
    if (stateCode) {
      const label = city ? `${city}, ${stateCode}` : (stateName || stateCode);
      setLocationLabel(label);
      setLocationActive(true);
      setFilters((f) => ({ ...f, state: stateCode }));
    }
  }

  const GOOD_ACCURACY_M = 30;   // para de ouvir o GPS quando chega a essa precisão
  const MAX_WATCH_MS    = 15000; // ou depois desse tempo, com a melhor leitura obtida

  // onError opcional: fn(mensagem) chamada quando o GPS falha sem nenhuma leitura
  const geolocate = useCallback((onError) => {
    if (!navigator.geolocation) {
      onError?.('Geolocalização não suportada neste navegador.');
      return;
    }
    // Cancela uma busca anterior por completo (leitura e temporizador)
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    clearTimeout(watchTimerRef.current);

    let best = null;
    let stateFilterDone = false;
    const finish = () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
      clearTimeout(watchTimerRef.current);
    };
    watchTimerRef.current = setTimeout(() => {
      finish();
      if (!best) onError?.('Não foi possível obter sua localização.');
    }, MAX_WATCH_MS);

    watchRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        if (best && coords.accuracy >= best.accuracy) return; // só aceita leituras melhores
        best = coords;
        showPosition(coords);
        // O estado (UF) não muda com refinamentos de metros: consulta o Nominatim uma vez só
        if (!stateFilterDone) { stateFilterDone = true; applyStateFilter(coords); }
        if (coords.accuracy <= GOOD_ACCURACY_M) finish();
      },
      (err) => {
        console.warn('[Geo]', err.message);
        if (err.code === 1) {
          finish();
          onError?.('Permissão de localização negada. Habilite nas configurações do navegador.');
        }
        // Timeout ou sinal ruim: continua ouvindo até MAX_WATCH_MS
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: MAX_WATCH_MS }
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-geolocalização silenciosa ao montar (não exibe erro se negado)
  useEffect(() => {
    geolocate();
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      clearTimeout(watchTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Limpa o filtro de localização sem desativar o GPS
  const clearLocationFilter = useCallback(() => {
    setLocationActive(false);
    setLocationLabel(null);
    setFilters((f) => {
      const next = { ...f };
      delete next.state;
      return next;
    });
  }, []);

  // ── Ir para lugar específico ────────────────────────────────────────────────
  const flyTo = useCallback((lat, lng, zoom = 14) => {
    const currentZoom = mapRef.current?.getZoom() ?? DEFAULT_ZOOM;
    const targetZoom  = Math.max(currentZoom, zoom);
    setMapCenter([lat, lng]);
    setMapZoom(targetZoom);
    mapRef.current?.setView([lat, lng], targetZoom, { animate: true, duration: 0.4 });
  }, []);

  const reload = useCallback(() => setFilters((f) => ({ ...f })), []);

  const updatePlaceAlert = useCallback((placeId, level) => {
    setPlaces((prev) =>
      prev.map((p) => (p.id === placeId ? { ...p, alert_level: level } : p))
    );
    if (selectedPlace?.id === placeId) {
      setSelectedPlace((p) => p && { ...p, alert_level: level });
    }
  }, [selectedPlace]);

  return {
    places, loading,
    filters, setFilters,
    userLocation, setUserLocation, userAccuracy, setUserAccuracy,
    selectedPlace, setSelectedPlace,
    mapCenter, mapZoom, mapRef,
    geolocate, flyTo, reload,
    updatePlaceAlert,
    // filtro de localização
    locationLabel, locationActive, clearLocationFilter,
  };
}
