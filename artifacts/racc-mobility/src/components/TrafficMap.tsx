import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  identificador?: string | number;
  latitud?: number;
  longitud?: number;
  tipus?: string | number;
  subtipus?: string | number;
  carretera?: string;
  pk_inici?: string | number | null;
  pk_fi?: string | number | null;
  pk_final?: string | number | null;
  Pk_inici?: string | number | null;
  Pk_final?: string | number | null;
  Longitud?: number | null;
  causa?: string;
  data?: string;
  nivell?: number;
  sentit?: string;
  descripcio?: string;
  descripcio_tipus?: string;
  font?: string;
  cap_a?: string;
}

const parsePk = (value: number | string | null | undefined): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;

  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const calculateLongitud = (incident: Incidencia): number | null => {
  const pkInici = parsePk(incident.pk_inici ?? incident.Pk_inici);
  const pkFinal = parsePk(incident.pk_fi ?? incident.pk_final ?? incident.Pk_final);

  return pkInici === null || pkFinal === null
    ? null
    : Math.abs(pkFinal - pkInici);
};

const incidentFilterFields = [
  'identificador',
  'descripcio_tipus',
  'tipus',
  'subtipus',
  'carretera',
  'pk_inici',
  'pk_fi',
  'causa',
  'nivell',
  'sentit',
  'cap_a',
  'descripcio',
  'data',
  'font',
] as const;

type IncidentFilterField = typeof incidentFilterFields[number];
type FilterField = 'all' | IncidentFilterField;

interface IncidentFilter {
  id: number;
  field: FilterField;
  value: string;
}

const filterFieldOptions: { value: FilterField; label: string }[] = [
  { value: 'all', label: 'Tots els camps' },
  { value: 'descripcio_tipus', label: 'Categoria' },
  { value: 'tipus', label: 'Tipus (codi)' },
  { value: 'subtipus', label: 'Subtipus' },
  { value: 'carretera', label: 'Carretera' },
  { value: 'causa', label: 'Causa' },
  { value: 'nivell', label: 'Nivell' },
  { value: 'sentit', label: 'Sentit' },
  { value: 'cap_a', label: 'Cap a' },
  { value: 'descripcio', label: 'Descripció' },
  { value: 'data', label: 'Data' },
  { value: 'identificador', label: 'Identificador SCT' },
  { value: 'pk_inici', label: 'PK inici' },
  { value: 'pk_fi', label: 'PK fi' },
  { value: 'font', label: 'Font' },
];

const displayValue = (value: string | number | null | undefined) =>
  value === undefined || value === null ? '' : String(value);

const rowFilterText = (incident: Incidencia, field: FilterField) => {
  if (field === 'all') {
    return incidentFilterFields
      .map(attribute => displayValue(incident[attribute]))
      .join(' ');
  }
  return displayValue(incident[field]);
};

const filterFieldLabel = (field: FilterField) =>
  filterFieldOptions.find(option => option.value === field)?.label ?? 'Tots els camps';

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
  const [filterField, setFilterField] = useState<FilterField>('all');
  const [filterValue, setFilterValue] = useState('');
  const [filters, setFilters] = useState<IncidentFilter[]>([]);
  const [longitudeFilter, setLongitudeFilter] = useState('');
  const nextFilterId = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/incidencias');
        const data = await res.json();
        const all: Incidencia[] = data.incidencias ?? [];
        const withLongitud = all.map(incident => ({
          ...incident,
          Longitud: calculateLongitud(incident),
        }));
        setIncidents(withLongitud.filter(i => Number.isFinite(i.latitud) && Number.isFinite(i.longitud)));
      } catch (e) {
        setError('No s\'han pogut carregar les incidències.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filterSuggestions = useMemo(() => {
    if (filterField === 'all') return [];
    return Array.from(
      new Set(
        incidents
          .map(incident => rowFilterText(incident, filterField))
          .filter(Boolean),
      ),
    )
      .sort((a, b) => a.localeCompare(b, 'ca'))
      .slice(0, 100);
  }, [incidents, filterField]);

  const filteredByAttributes = useMemo(
    () => incidents.filter(incident =>
      filters.every(filter =>
        rowFilterText(incident, filter.field).toLocaleLowerCase().includes(filter.value.toLocaleLowerCase()),
      ),
    ),
    [incidents, filters],
  );

  const desiredLongitud = Number(longitudeFilter);
  const hasLongitudeFilter =
    longitudeFilter.trim() !== '' && Number.isFinite(desiredLongitud);
  const filteredIncidents = useMemo(
    () => filteredByAttributes.filter(incident => {
      if (!hasLongitudeFilter) return true;
      if (incident.Longitud === null || incident.Longitud === undefined) return false;
      return incident.Longitud > desiredLongitud;
    }),
    [filteredByAttributes, hasLongitudeFilter, desiredLongitud],
  );
  const hasAnyFilters = filters.length > 0 || hasLongitudeFilter;

  const addFilter = () => {
    const value = filterValue.trim();
    if (!value) return;
    setFilters(previous => [
      ...previous,
      { id: nextFilterId.current++, field: filterField, value },
    ]);
    setFilterValue('');
  };

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
      <div className="traffic-map-filter-panel">
        <div className="traffic-map-filter-entry">
          <select
            value={filterField}
            onChange={event => setFilterField(event.target.value as FilterField)}
            aria-label="Camp del filtre del mapa"
          >
            {filterFieldOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input
            type="search"
            value={filterValue}
            onChange={event => setFilterValue(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addFilter();
              }
            }}
            list="traffic-map-filter-values"
            placeholder="Escriu o selecciona un valor…"
            aria-label="Valor del filtre del mapa"
          />
          <datalist id="traffic-map-filter-values">
            {filterSuggestions.map(suggestion => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
          <button type="button" onClick={addFilter} disabled={!filterValue.trim()}>
            + Afegir filtre
          </button>
        </div>
        {filters.length > 0 && (
          <div className="traffic-map-active-filters" aria-label="Filtres actius">
            <span className="traffic-map-filter-caption">Filtres actius</span>
            {filters.map(filter => (
              <span className="traffic-map-filter-chip" key={filter.id}>
                <span>{filterFieldLabel(filter.field)}:</span>
                <strong>{filter.value}</strong>
                <button
                  type="button"
                  onClick={() => setFilters(previous => previous.filter(item => item.id !== filter.id))}
                  aria-label={`Elimina el filtre ${filterFieldLabel(filter.field)} ${filter.value}`}
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              className="traffic-map-clear-filters"
              onClick={() => setFilters([])}
            >
              Neteja filtres
            </button>
          </div>
        )}
      </div>
      <div className="traffic-map-legend">
        <span className="legend-badge" style={{ background: '#27ae60' }}>Nivell 1</span>
        <span className="legend-badge" style={{ background: '#f39c12' }}>Nivell 2</span>
        <span className="legend-badge" style={{ background: '#e67e22' }}>Nivell 3</span>
        <span className="legend-badge" style={{ background: '#e74c3c' }}>Nivell 4+</span>
        <div className="traffic-map-longitude-filter">
          <label htmlFor="traffic-map-longitud-filter">Longitud superior a (km)</label>
          <div className="traffic-map-longitude-controls">
            <input
              id="traffic-map-longitud-filter"
              data-testid="input-longitud-filter"
              type="number"
              min="0"
              step="any"
              value={longitudeFilter}
              onChange={event => setLongitudeFilter(event.currentTarget.value)}
              placeholder="p. ex. 2"
              aria-label="Filtra per longitud calculada superior al valor indicat"
            />
            {longitudeFilter !== '' && (
              <button
                type="button"
                data-testid="button-clear-longitud-filter"
                aria-label="Neteja el filtre de longitud"
                onClick={() => setLongitudeFilter('')}
              >
                Neteja
              </button>
            )}
          </div>
          <small>Calculada com |PK final − PK inici|</small>
        </div>
        <span className="legend-count" data-testid="text-visible-incident-count">
          {hasAnyFilters
            ? `${filteredIncidents.length} de ${incidents.length} incidents mostrats`
            : `${incidents.length} incidents actius`}
        </span>
      </div>
      {hasAnyFilters && filteredIncidents.length === 0 && (
        <div className="traffic-map-empty" role="status">
          Cap incidència coincideix amb els filtres actius.
        </div>
      )}
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
        {filteredIncidents.map((inc, idx) => (
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
                {inc.Longitud !== null && inc.Longitud !== undefined && (
                  <p>
                    Longitud del tram: {inc.Longitud.toLocaleString('ca-ES', { maximumFractionDigits: 3 })} km
                  </p>
                )}
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
