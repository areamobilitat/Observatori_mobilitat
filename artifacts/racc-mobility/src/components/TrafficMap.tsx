import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './TrafficMap.css';

// Fix default marker icons in Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface Incidencia {
  latitud?: number;
  longitud?: number;
  carretera?: string;
  causa?: string;
  descripcio?: string;
  descripcio_tipus?: string;
  tipus?: number;
  nivell?: number;
  data?: string;
  sentit?: string;
  cap_a?: string;
}
// --------------------------

// aqui posem el codi del filtre!!!!!!

// --------------------------
const severityColor = (nivell?: number): string => {
  if (!nivell) return '#3498db';
  if (nivell >= 4) return '#e74c3c';
  if (nivell === 3) return '#e67e22';
  if (nivell === 2) return '#f39c12';
  return '#27ae60';
};

const makeIcon = (color: string) =>
  new L.DivIcon({
    className: '',
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:${color};
      border:2px solid #fff;
      box-shadow:0 0 6px rgba(0,0,0,0.35);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

const TrafficMap: React.FC = () => {
  const [incidents, setIncidents] = useState<Incidencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/incidencias');
        const data = await res.json();
        const all: Incidencia[] = data.incidencias ?? [];
        setIncidents(all.filter(i => i.latitud && i.longitud));
      } catch (e) {
        setError('No s\'han pogut carregar les incidències.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="traffic-map-loading">
        <div className="loading-spinner" />
        <p>Carregant incidències…</p>
      </div>
    );
  }

  if (error) {
    return <div className="traffic-map-error">{error}</div>;
  }

  return (
    <div className="traffic-map-wrapper">
      <div className="traffic-map-legend">
        <span className="legend-badge" style={{ background: '#27ae60' }}>Nivell 1</span>
        <span className="legend-badge" style={{ background: '#f39c12' }}>Nivell 2</span>
        <span className="legend-badge" style={{ background: '#e67e22' }}>Nivell 3</span>
        <span className="legend-badge" style={{ background: '#e74c3c' }}>Nivell 4+</span>
        <span className="legend-count">{incidents.length} incidents actius</span>
      </div>
      <MapContainer
        center={[41.5, 1.8]}
        zoom={8}
        className="traffic-map text-center"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {incidents.map((inc, idx) => (
          <Marker
            key={idx}
            position={[inc.latitud!, inc.longitud!]}
            icon={makeIcon(severityColor(inc.nivell))}
          >
            <Popup>
              <div className="incident-popup">
                <strong>{inc.carretera || 'Carretera desconeguda'}</strong>
                {inc.descripcio_tipus && <p>📌 {inc.descripcio_tipus}</p>}
                {inc.causa && <p>⚠️ {inc.causa}</p>}
                {inc.descripcio && <p>📝 {inc.descripcio}</p>}
                {inc.sentit && <p>➡️ Sentit: {inc.sentit}</p>}
                {inc.cap_a && <p>🏁 Cap a: {inc.cap_a}</p>}
                {inc.data && <p>🗓️ {inc.data}</p>}
                {inc.nivell !== undefined && (
                  <span className="popup-nivel" style={{ background: severityColor(inc.nivell) }}>
                    Nivell {inc.nivell}
                  </span>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default TrafficMap;
