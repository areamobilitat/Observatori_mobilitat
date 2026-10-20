// ─── TAB: AFORAMENT ───────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './Aforament.css';

interface Aforament {
  chart_row?: number;
  carretera?: string;
  pk_km?: number;
  imd?: number;
  latitud: number;
  longitud: number;
  coordinate_source?: string;
  coordinate_note?: string;
}

interface AforamentResponse {
  aforaments: Aforament[];
  source: string;
  source_label?: string;
  record_count?: number;
}

interface AforamentMapPoint {
  point: Aforament;
  records: Aforament[];
}

const formatNumber = (value?: number) =>
  value === undefined || Number.isNaN(value)
    ? '—'
    : new Intl.NumberFormat('ca-ES', { maximumFractionDigits: 0 }).format(value);

const intensityColor = (imd?: number) => {
  if (!imd) return '#64748b';
  if (imd >= 30000) return '#b91c1c';
  if (imd >= 15000) return '#ea580c';
  if (imd >= 5000) return '#eab308';
  return '#16a34a';
};

const markerRadius = (imd?: number) => {
  if (!imd) return 5;
  return Math.min(11, Math.max(5, 5 + Math.log10(imd) * 1.4));
};

const Aforament: React.FC = () => {
  const [aforaments, setAforaments] = useState<Aforament[]>([]);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAforaments = async () => {
      try {
        const response = await fetch('/api/aforaments');
        if (!response.ok) throw new Error('Aforaments unavailable');
        const data = (await response.json()) as AforamentResponse;
        setAforaments(data.aforaments ?? []);
        setSource(data.source ?? '');
      } catch {
        setError('No s’han pogut carregar les dades d’aforament.');
      } finally {
        setLoading(false);
      }
    };

    loadAforaments();
  }, []);

  const withData = useMemo(
    () => aforaments.filter((point) => Number.isFinite(point.latitud) && Number.isFinite(point.longitud)),
    [aforaments],
  );
  const mapPoints = useMemo(() => {
    const grouped = new Map<string, Aforament[]>();
    withData.forEach((point) => {
      const key = [
        point.carretera,
        point.pk_km,
        point.latitud.toFixed(6),
        point.longitud.toFixed(6),
      ].join('|');
      const records = grouped.get(key) ?? [];
      records.push(point);
      grouped.set(key, records);
    });
    return Array.from(grouped.values()).map((records): AforamentMapPoint => ({
      point: records[0],
      records,
    }));
  }, [withData]);
  const averageImd = useMemo(() => {
    const values = withData.map((point) => point.imd).filter((value): value is number => typeof value === 'number');
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
  }, [withData]);
  const highest = useMemo(
    () => withData.reduce<Aforament | undefined>((best, point) => (!best || (point.imd ?? 0) > (best.imd ?? 0) ? point : best), undefined),
    [withData],
  );

  return (
    <div className="aforament-page">
      <div className="aforament-summary">
        <div>
          <span className="aforament-kicker">AFORAMENTS DE TRÀNSIT</span>
          <h2>Intensitat mitjana diària</h2>
          <p>Consulta la IMD de les estacions de la xarxa de carreteres de Catalunya.</p>
        </div>
        <div className="aforament-stats">
          <div className="aforament-stat">
            <strong>{loading ? '…' : formatNumber(withData.length)}</strong>
            <span>punts al mapa</span>
          </div>
          <div className="aforament-stat">
            <strong>{loading ? '…' : formatNumber(averageImd)}</strong>
            <span>IMD mitjana</span>
          </div>
          <div className="aforament-stat">
            <strong>{loading ? '…' : formatNumber(highest?.imd)}</strong>
            <span>màxima IMD</span>
          </div>
        </div>
      </div>

      {loading && (
        <div className="aforament-state">
          <div className="loading-spinner" />
          <p>Carregant estacions d’aforament…</p>
        </div>
      )}

      {error && <div className="aforament-state aforament-error">{error}</div>}

      {!loading && !error && (
        <section className="aforament-map-section">
          <div className="aforament-section-header">
            <div>
              <h3>Mapa d’estacions d’aforament</h3>
              <p>Fes clic sobre qualsevol punt per consultar la seva IMD.</p>
            </div>
            <div className="aforament-legend" aria-label="Llegenda d'intensitat">
              <span><i style={{ background: '#16a34a' }} /> Baixa</span>
              <span><i style={{ background: '#eab308' }} /> Mitjana</span>
              <span><i style={{ background: '#ea580c' }} /> Alta</span>
              <span><i style={{ background: '#b91c1c' }} /> Molt alta</span>
            </div>
          </div>
          <div className="aforament-map-wrapper">
            <MapContainer
              center={[41.6, 1.7]}
              zoom={8}
              className="aforament-map"
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {mapPoints.map(({ point, records }, index) => (
                <CircleMarker
                  key={`${point.carretera ?? 'road'}-${point.pk_km ?? 'pk'}-${point.latitud}-${point.longitud}-${index}`}
                  center={[point.latitud, point.longitud]}
                  radius={markerRadius(Math.max(...records.map((record) => record.imd ?? 0)))}
                  pathOptions={{
                    color: '#ffffff',
                    weight: 1.5,
                    fillColor: intensityColor(point.imd),
                    fillOpacity: 0.9,
                  }}
                >
                  <Popup>
                    <div className="aforament-popup">
                      <div className="aforament-popup-heading">
                        <strong>{point.carretera || 'Estació d’aforament'}</strong>
                        <span>
                          {records.length > 1 ? `${records.length} registres` : `Fila ${point.chart_row || '—'}`}
                        </span>
                      </div>
                      <div className="imd-values">
                        {records.map((record) => (
                          <div className="imd-entry" key={record.chart_row}>
                            <span>IMD · fila {record.chart_row || '—'}</span>
                            <strong>{formatNumber(record.imd)}</strong>
                            <small>vehicles / dia</small>
                          </div>
                        ))}
                      </div>
                      <dl>
                        <div><dt>PK</dt><dd>{point.pk_km?.toFixed(3).replace('.', ',') || '—'}</dd></div>
                        <div><dt>Registres del gràfic</dt><dd>{records.length}</dd></div>
                      </dl>
                      {point.coordinate_note && <p className="aforament-tram">{point.coordinate_note}</p>}
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
          <div className="aforament-source">
            Font: {source || 'Llista de carreteres (IMD)'} · Els valors mostrats provenen del gràfic adjunt.
          </div>
        </section>
      )}
    </div>
  );
};

export default Aforament;