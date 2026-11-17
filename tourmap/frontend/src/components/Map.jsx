import { useEffect, memo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import { categoryLabel } from '../utils/categories';


// ── Safety score ──────────────────────────────────────────────────────────────
// Retorna a cor do anel de segurança baseada em rating + alerta
function safetyRingColor(place) {
  if (place.alert_level === 'high')   return '#DC2626'; // vermelho
  if (place.alert_level === 'medium') return '#F59E0B'; // âmbar
  const avg   = parseFloat(place.avg_rating || 0);
  const count = place.review_count    || 0;
  if (count < 3) return null;          // dados insuficientes — sem anel
  if (avg >= 4.0) return '#059669';   // verde
  if (avg >= 3.0) return '#F59E0B';   // âmbar
  return '#DC2626';                    // vermelho
}

// ── Ícones dos marcadores ─────────────────────────────────────────────────────
function markerIcon(place) {
  const ring  = safetyRingColor(place);
  const isAlert = place.alert_level === 'high';

  if (isAlert) {
    return L.divIcon({
      className: '',
      html: `<div style="position:relative;display:inline-block;">
        <svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 1C6.82 1 1 6.82 1 14c0 10.5 13 21 13 21S27 24.5 27 14C27 6.82 21.18 1 14 1z"
                fill="#DC2626" stroke="#991B1B" stroke-width="1.5"/>
          <text x="14" y="16" text-anchor="middle" dominant-baseline="middle"
                font-size="11" fill="white" font-weight="bold">⚠</text>
        </svg>
      </div>`,
      iconSize: [28, 36], iconAnchor: [14, 36], popupAnchor: [0, -38],
    });
  }

  if (place.type === 'event') {
    // Cor do diamante: verde se seguro, âmbar se médio/alerta, roxo se sem dados
    const fill = ring === '#059669' ? '#059669'
               : ring === '#F59E0B' ? '#D97706'
               : ring === '#DC2626' ? '#DC2626'
               : '#7C3AED';
    const stroke = ring === '#059669' ? '#065F46'
                 : ring === '#F59E0B' ? '#92400E'
                 : ring === '#DC2626' ? '#991B1B'
                 : '#5B21B6';
    return L.divIcon({
      className: '',
      html: `<div style="position:relative;display:inline-block;width:30px;height:30px;">
        <div style="
          width:30px;height:30px;border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          background:${fill};border:2.5px solid ${stroke};
          box-shadow:0 3px 8px rgba(0,0,0,.3);
          display:flex;align-items:center;justify-content:center;">
          <span style="transform:rotate(45deg);font-size:13px;line-height:1;">📅</span>
        </div>
      </div>`,
      iconSize: [30, 30], iconAnchor: [8, 30], popupAnchor: [7, -32],
    });
  }

  // Ponto turístico — pin com anel de segurança
  const pinColor = ring === '#059669' ? '#059669'
                 : ring === '#F59E0B' ? '#F59E0B'
                 : ring === '#DC2626' ? '#DC2626'
                 : '#F59E0B'; // padrão dourado sem dados
  const pinStroke = ring === '#059669' ? '#065F46'
                  : ring === '#F59E0B' ? '#B45309'
                  : ring === '#DC2626' ? '#991B1B'
                  : '#B45309';
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;display:inline-block;">
      <svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 1C6.82 1 1 6.82 1 14c0 10.5 13 21 13 21S27 24.5 27 14C27 6.82 21.18 1 14 1z"
              fill="${pinColor}" stroke="${pinStroke}" stroke-width="1.5"/>
        <text x="14" y="16" text-anchor="middle" dominant-baseline="middle"
              font-size="11" fill="white" font-weight="bold">★</text>
      </svg>
    </div>`,
    iconSize: [28, 36], iconAnchor: [14, 36], popupAnchor: [0, -38],
  });
}

function userIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:16px;height:16px;border-radius:50%;
      background:#2563EB;border:3px solid #fff;
      box-shadow:0 0 0 4px rgba(37,99,235,.25);"></div>`,
    iconSize:   [16, 16],
    iconAnchor: [8, 8],
  });
}

// ── Subcomponentes de controle ────────────────────────────────────────────────
function MapController({ mapRef }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map, mapRef]);
  return null;
}

function ClickHandler({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick?.(e.latlng) });
  return null;
}

const BRAZIL_BOUNDS = [[-35.0, -74.0], [6.0, -28.0]];
const BRAZIL_CENTER = [-14.235, -51.925];

function BoundsEnforcer() {
  const map    = useMap();
  const bounds = L.latLngBounds(BRAZIL_BOUNDS);
  useMapEvents({
    drag: () => { map.panInsideBounds(bounds, { animate: false }); },
  });
  return null;
}

function Legend() {
  return (
    <div className="map-legend">
      <div className="map-legend__item"><span style={{ background: '#059669' }} /> Seguro (≥4★)</div>
      <div className="map-legend__item"><span style={{ background: '#F59E0B' }} /> Atenção (3–4★)</div>
      <div className="map-legend__item"><span style={{ background: '#DC2626' }} /> Risco / Alerta</div>
      <div className="map-legend__item"><span style={{ background: '#7C3AED' }} /> Evento</div>
      <div className="map-legend__item"><span style={{ background: '#2563EB' }} /> Você</div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
function MapView({
  places = [],
  userLocation,
  userAccuracy,
  selectedPlace,
  onSelectPlace,
  onMapClick,
  mapRef,
  onCreateClick,
  isAuthenticated,
}) {
  const navigate = useNavigate();


  return (
    <div className="map-wrapper">
      <MapContainer
        center={BRAZIL_CENTER}
        zoom={5}
        minZoom={4}
        maxBounds={BRAZIL_BOUNDS}
        maxBoundsViscosity={1.0}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <MapController mapRef={mapRef} />
        <BoundsEnforcer />
        <ClickHandler onMapClick={isAuthenticated ? onMapClick : undefined} />

        <TileLayer
          attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {userLocation && userAccuracy > 0 && (
          // Margem de erro informada pelo navegador: a posição real está dentro do círculo
          <Circle
            center={userLocation}
            radius={userAccuracy}
            pathOptions={{ color: '#2563EB', weight: 1, fillColor: '#2563EB', fillOpacity: 0.08 }}
            interactive={false}
          />
        )}
        {userLocation && (
          <Marker position={userLocation} icon={userIcon()}>
            <Popup>
              Você está aqui
              {userAccuracy > 0 && <><br /><small>Precisão de ~{Math.round(userAccuracy)} m</small></>}
            </Popup>
          </Marker>
        )}

        <MarkerClusterGroup chunkedLoading maxClusterRadius={60} showCoverageOnHover={false}>
          {places.map((place) => {
            const ring = safetyRingColor(place);
            const finished = place.type === 'event' && !place.is_fixed && (() => {
              if (!place.event_date && !place.event_end_date) return false;
              const today = new Date()
                .toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
                .split('/').reverse().join('-');
              return (place.event_end_date || place.event_date) < today;
            })();

            return (
              <Marker
                key={place.id}
                position={[parseFloat(place.latitude), parseFloat(place.longitude)]}
                icon={markerIcon(place)}
                eventHandlers={{ click: () => onSelectPlace?.(place) }}
                opacity={finished ? 0.45 : 1}
              >
                <Popup>
                  <div className="map-popup">
                    {place.image_url && (
                      <img src={place.image_url} alt={place.name} className="map-popup__img" />
                    )}
                    <div className="map-popup__body">
                      <strong>{place.name}</strong>

                      {/* Badges */}
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <span className="map-popup__cat" style={{
                          background: place.type === 'event' ? '#7C3AED' : '#F59E0B',
                        }}>
                          {place.type === 'event' ? 'Evento' : categoryLabel(place.category)}
                        </span>
                        {ring && (
                          <span className="map-popup__cat" style={{ background: ring }}>
                            {ring === '#059669' ? 'Seguro'
                              : ring === '#F59E0B' ? 'Atenção'
                              : 'Risco'}
                          </span>
                        )}
                        {finished && (
                          <span className="map-popup__cat" style={{ background: '#6B7280' }}>
                            Encerrado
                          </span>
                        )}
                      </div>

                      {place.type === 'event' && place.creator && (
                        <span style={{ fontSize: 11, color: '#6B7280' }}>
                          por <strong>{place.creator.name}</strong>
                        </span>
                      )}
                      {place.type === 'event' && place.event_date && (
                        <span style={{ fontSize: 11, color: '#6B7280' }}>
                          {new Date(place.event_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                          {place.event_start_time && ` · ${place.event_start_time.slice(0, 5)}`}
                          {place.event_end_time && ` – ${place.event_end_time.slice(0, 5)}`}
                        </span>
                      )}
                      <span>
                        ⭐ {parseFloat(place.avg_rating || 0) > 0
                          ? parseFloat(place.avg_rating).toFixed(1)
                          : 'Sem avaliações'}
                      </span>

                      <button
                        className="btn btn--primary btn--sm"
                        style={{ marginTop: 6, width: '100%', fontSize: 12,
                          background: place.type === 'event' ? '#7C3AED' : undefined }}
                        onClick={() => navigate(`/places/${place.id}`)}
                      >
                        Ver detalhes
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>

      <Legend />

      {isAuthenticated && (
        <button
          className="map-fab"
          onClick={onCreateClick}
          aria-label="Criar lugar"
          title="Criar lugar"
        >
          +
        </button>
      )}
    </div>
  );
}

export default memo(MapView);
