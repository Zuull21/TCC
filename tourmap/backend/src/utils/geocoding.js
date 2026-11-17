/**
 * geocoding.js
 * Funções de geocodificação usando Nominatim (OpenStreetMap) — sem chave de API.
 * Cache em memória de 1 hora para respeitar os termos de uso do Nominatim.
 */

const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'TourMap/1.0 (academic project; contact: admin@tourmap.com.br)';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora
const CACHE_MAX_SIZE = 500;

// ── Cache em memória ──────────────────────────────────────────────────────────

const _cache = new Map();

function _getCached(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return entry.data;
}

function _setCache(key, data) {
  _cache.set(key, { ts: Date.now(), data });

  if (_cache.size > CACHE_MAX_SIZE) {
    const cutoff = Date.now() - CACHE_TTL_MS;
    for (const [k, v] of _cache) {
      if (v.ts < cutoff) _cache.delete(k);
    }
  }
}

// ── Haversine ─────────────────────────────────────────────────────────────────

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Distância em km entre dois pontos geográficos (fórmula de Haversine).
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Bounding box (graus) para pré-filtro SQL via índice lat/lng.
 */
function boundingBox(lat, lon, radiusKm) {
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.cos(toRad(lat)));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLon: lon - lonDelta,
    maxLon: lon + lonDelta,
  };
}

// ── Nominatim ─────────────────────────────────────────────────────────────────

/**
 * Geocodificação reversa: (lat, lng) → endereço Nominatim.
 * Retorna objeto JSON do Nominatim ou null em falha/timeout.
 * Cache de 1 hora por coordenada arredondada a 4 casas decimais.
 */
async function reverseGeocode(lat, lon) {
  const key = `rev:${parseFloat(lat).toFixed(4)},${parseFloat(lon).toFixed(4)}`;
  const cached = _getCached(key);
  if (cached !== null) return cached;

  try {
    const url =
      `${NOMINATIM_REVERSE}?lat=${lat}&lon=${lon}&format=json&accept-language=pt-BR`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    _setCache(key, data);
    return data;
  } catch {
    return null;
  }
}

module.exports = { haversineDistance, boundingBox, reverseGeocode };
