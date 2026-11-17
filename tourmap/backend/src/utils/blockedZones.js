const { haversineDistance } = require('./geocoding');

// Zonas de alto risco baseadas em dados de homicídio e criminalidade organizada (2022-2024).
// Fontes: IBGE, Fórum Brasileiro de Segurança Pública, ACLED, Insight Crime.
// Critério: área com alta taxa de homicídio E sem atrativo turístico consolidado.
const BLOCKED_ZONES = [
  // ── Rio de Janeiro ────────────────────────────────────────────────────────────
  { name: 'Complexo do Alemão',     city: 'Rio de Janeiro', state: 'RJ', lat: -22.876,  lng: -43.288,  radiusKm: 1.4 },
  { name: 'Complexo da Maré',       city: 'Rio de Janeiro', state: 'RJ', lat: -22.856,  lng: -43.235,  radiusKm: 1.5 },
  { name: 'Complexo da Penha',      city: 'Rio de Janeiro', state: 'RJ', lat: -22.882,  lng: -43.271,  radiusKm: 1.0 },
  { name: 'Jacarezinho',            city: 'Rio de Janeiro', state: 'RJ', lat: -22.895,  lng: -43.281,  radiusKm: 0.8 },
  { name: 'Manguinhos',             city: 'Rio de Janeiro', state: 'RJ', lat: -22.876,  lng: -43.236,  radiusKm: 0.8 },
  { name: 'Cidade de Deus',         city: 'Rio de Janeiro', state: 'RJ', lat: -22.957,  lng: -43.373,  radiusKm: 0.8 },
  // Rocinha TEM aspectos turísticos em partes, mas o interior é controlado por tráfico
  { name: 'Rocinha (interior)',      city: 'Rio de Janeiro', state: 'RJ', lat: -22.987,  lng: -43.249,  radiusKm: 0.7 },

  // ── Maceió — maior taxa de homicídio do Brasil ────────────────────────────────
  { name: 'Benedito Bentes',        city: 'Maceió',         state: 'AL', lat: -9.5502,  lng: -35.7263, radiusKm: 2.0 },
  { name: 'Trapiche da Barra',      city: 'Maceió',         state: 'AL', lat: -9.5601,  lng: -35.7380, radiusKm: 1.2 },
  { name: 'Vergel do Lago',         city: 'Maceió',         state: 'AL', lat: -9.5850,  lng: -35.7450, radiusKm: 1.0 },
  { name: 'Santos Dumont',          city: 'Maceió',         state: 'AL', lat: -9.6025,  lng: -35.7497, radiusKm: 1.2 },

  // ── Fortaleza ─────────────────────────────────────────────────────────────────
  { name: 'Pirambu',                city: 'Fortaleza',      state: 'CE', lat: -3.7100,  lng: -38.5530, radiusKm: 1.5 },
  { name: 'Bom Jardim',             city: 'Fortaleza',      state: 'CE', lat: -3.8333,  lng: -38.6167, radiusKm: 2.0 },
  { name: 'Barra do Ceará',         city: 'Fortaleza',      state: 'CE', lat: -3.7033,  lng: -38.5789, radiusKm: 1.5 },
  { name: 'Jangurussu',             city: 'Fortaleza',      state: 'CE', lat: -3.8361,  lng: -38.5133, radiusKm: 1.2 },
  { name: 'Mondubim',               city: 'Fortaleza',      state: 'CE', lat: -3.8019,  lng: -38.5717, radiusKm: 1.0 },

  // ── Natal ─────────────────────────────────────────────────────────────────────
  { name: 'Felipe Camarão',         city: 'Natal',          state: 'RN', lat: -5.8128,  lng: -35.2603, radiusKm: 1.5 },
  { name: 'Nordeste (Natal)',        city: 'Natal',          state: 'RN', lat: -5.7755,  lng: -35.2124, radiusKm: 1.8 },
  { name: 'Cidade da Esperança',    city: 'Natal',          state: 'RN', lat: -5.8311,  lng: -35.2564, radiusKm: 1.0 },

  // ── Salvador ──────────────────────────────────────────────────────────────────
  { name: 'Nordeste de Amaralina',  city: 'Salvador',       state: 'BA', lat: -13.0033, lng: -38.4636, radiusKm: 1.0 },
  { name: 'Sussuarana',             city: 'Salvador',       state: 'BA', lat: -12.9494, lng: -38.4206, radiusKm: 1.2 },
  { name: 'Subúrbio Ferroviário',   city: 'Salvador',       state: 'BA', lat: -12.9197, lng: -38.4811, radiusKm: 2.0 },
  { name: 'Valéria',                city: 'Salvador',       state: 'BA', lat: -12.9003, lng: -38.3997, radiusKm: 1.0 },

  // ── Recife ────────────────────────────────────────────────────────────────────
  { name: 'Ibura',                  city: 'Recife',         state: 'PE', lat: -8.1308,  lng: -34.9469, radiusKm: 1.5 },
  { name: 'Coque',                  city: 'Recife',         state: 'PE', lat: -8.0819,  lng: -34.8972, radiusKm: 0.8 },
  { name: 'Iputinga',               city: 'Recife',         state: 'PE', lat: -8.0561,  lng: -34.9497, radiusKm: 1.0 },
  { name: 'Torrões',                city: 'Recife',         state: 'PE', lat: -8.0917,  lng: -34.9583, radiusKm: 1.0 },

  // ── Manaus ────────────────────────────────────────────────────────────────────
  { name: 'Alvorada',               city: 'Manaus',         state: 'AM', lat: -3.1300,  lng: -60.0500, radiusKm: 1.2 },
  { name: 'Compensa',               city: 'Manaus',         state: 'AM', lat: -3.1050,  lng: -60.0580, radiusKm: 1.2 },
  { name: 'São Jorge',              city: 'Manaus',         state: 'AM', lat: -3.0900,  lng: -60.0533, radiusKm: 1.0 },
  { name: 'Cidade Nova',            city: 'Manaus',         state: 'AM', lat: -3.0556,  lng: -59.9917, radiusKm: 1.5 },

  // ── São Paulo ─────────────────────────────────────────────────────────────────
  { name: 'Capão Redondo',          city: 'São Paulo',      state: 'SP', lat: -23.6593, lng: -46.7682, radiusKm: 1.5 },
  { name: 'Jardim Ângela',          city: 'São Paulo',      state: 'SP', lat: -23.7150, lng: -46.7430, radiusKm: 1.5 },
  { name: 'Grajaú',                 city: 'São Paulo',      state: 'SP', lat: -23.7328, lng: -46.6836, radiusKm: 1.5 },
  { name: 'São Mateus',             city: 'São Paulo',      state: 'SP', lat: -23.5956, lng: -46.4564, radiusKm: 1.5 },

  // ── Belém ─────────────────────────────────────────────────────────────────────
  { name: 'Terra Firme',            city: 'Belém',          state: 'PA', lat: -1.4536,  lng: -48.4736, radiusKm: 1.2 },
  { name: 'Guamá',                  city: 'Belém',          state: 'PA', lat: -1.4691,  lng: -48.4884, radiusKm: 1.5 },
];

function isInBlockedZone(lat, lng) {
  for (const zone of BLOCKED_ZONES) {
    const dist = haversineDistance(lat, lng, zone.lat, zone.lng);
    if (dist <= zone.radiusKm) return zone;
  }
  return null;
}

module.exports = { isInBlockedZone };
