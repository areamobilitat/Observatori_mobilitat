import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './AmbMetro.css';

interface Train {
  arrival_at: string;
  seconds_remaining: number;
  minutes_remaining: number;
}

interface Destination {
  name: string;
  trains: Train[];
}

interface MetroStation {
  id: number;
  name: string;
  found: boolean;
  details: Record<string, unknown>;
  destinations: Destination[];
}

interface MetroLine {
  id: string;
  color: string;
  station_count: number;
  stations: MetroStation[];
}

interface MetroResponse {
  status: 'ok' | 'credentials_missing';
  message: string | null;
  api_timestamp: string | null;
  fetched_at: string;
  summary: {
    line_count: number;
    station_count: number;
    stations_found: number;
    trains_count: number;
    arrivals_next_5_minutes: number;
  };
  lines: MetroLine[];
}

const numberFormat = new Intl.NumberFormat('ca-ES');

const formatClock = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ca-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
};

const formatDetail = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const AmbMetro: React.FC = () => {
  const [data, setData] = useState<MetroResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const loadData = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/amb-metro', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Resposta del servei: ${response.status}`);
      const result = (await response.json()) as MetroResponse;
      if (!result || !Array.isArray(result.lines) || !result.summary) {
        throw new Error('El servei ha retornat una resposta que no es pot llegir.');
      }
      setData(result);
      setLastUpdated(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No s’han pogut carregar les dades del metro.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(true), 60_000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const filteredLines = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('ca');
    if (!term || !data) return data?.lines ?? [];
    return data.lines.map((line) => ({
      ...line,
      stations: line.stations.filter((station) =>
        `${station.name} ${line.id}`.toLocaleLowerCase('ca').includes(term),
      ),
    })).filter((line) => line.stations.length > 0);
  }, [data, query]);

  const hasStations = (data?.lines ?? []).some((line) => line.stations.length > 0);
  const credentialsMissing = data?.status === 'credentials_missing';

  return (
    <main className="amb-metro" data-testid="page-amb-metro">
      <section className="metro-intro" aria-labelledby="metro-title">
        <div className="metro-intro__copy">
          <div className="metro-eyebrow"><span className="metro-live-mark" /> OPERACIONS · ÀREA METROPOLITANA</div>
          <h2 id="metro-title">El metro, línia a línia.</h2>
          <p>Estacions AMB/TMB i properes arribades en una sola vista operativa.</p>
        </div>
        <button className="metro-refresh" type="button" onClick={() => void loadData(true)} disabled={refreshing} data-testid="button-refresh-metro">
          <span className={refreshing ? 'metro-refresh__glyph is-refreshing' : 'metro-refresh__glyph'} aria-hidden="true">↻</span>
          {refreshing ? 'Actualitzant…' : 'Actualitza'}
        </button>
      </section>

      {data && (
        <section className="metro-overview" aria-label="Resum de la xarxa">
          <div className="metro-overview__status">
            <span className={`metro-status-dot ${credentialsMissing ? 'is-muted' : ''}`} />
            <div>
              <strong data-testid="status-metro-api">{credentialsMissing ? 'Arribades no disponibles' : 'Dades de xarxa'}</strong>
              <span>{credentialsMissing ? 'Llista d’estacions de referència' : `Darrera consulta ${formatClock(data.api_timestamp || data.fetched_at)}`}</span>
            </div>
          </div>
          <div className="metro-metrics">
            <div className="metro-metric" data-testid="metric-line-count"><strong>{numberFormat.format(data.summary.line_count)}</strong><span>Línies</span></div>
            <div className="metro-metric" data-testid="metric-station-count"><strong>{numberFormat.format(data.summary.station_count)}</strong><span>Estacions</span></div>
            <div className="metro-metric" data-testid="metric-stations-found"><strong>{credentialsMissing ? '—' : numberFormat.format(data.summary.stations_found)}</strong><span>Amb dades</span></div>
            <div className="metro-metric" data-testid="metric-trains-count"><strong>{credentialsMissing ? '—' : numberFormat.format(data.summary.trains_count)}</strong><span>Trens detectats</span></div>
            <div className="metro-metric metro-metric--urgent" data-testid="metric-next-five-minutes"><strong>{credentialsMissing ? '—' : numberFormat.format(data.summary.arrivals_next_5_minutes)}</strong><span>Arriben en 5 min</span></div>
          </div>
        </section>
      )}

      {credentialsMissing && (
        <div className="metro-notice" role="status" data-testid="notice-credentials-missing">
          <strong>Connexió en espera</strong>
          <span>{data?.message || 'Les credencials de consulta en directe no estan configurades. Es mostra la llista de referència; no hi ha horaris en temps real.'}</span>
        </div>
      )}

      <section className="metro-network" aria-label="Estacions per línia">
        <div className="metro-network__heading">
          <div>
            <span className="metro-section-kicker">XARXA TMB / AMB</span>
            <h3>Estacions i arribades</h3>
          </div>
          {data && <span className="metro-updated" data-testid="text-last-updated">{lastUpdated ? `Actualitzat ${formatClock(data.fetched_at)}` : 'Sense actualització'}</span>}
        </div>

        <label className="metro-search">
          <span aria-hidden="true" className="metro-search__icon">⌕</span>
          <span className="metro-visually-hidden">Cerca una estació o línia</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca estació o línia"
            data-testid="input-search-station"
          />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Esborra la cerca" data-testid="button-clear-search">Esborra</button>}
        </label>

        {loading && !data && (
          <div className="metro-state metro-loading" role="status" data-testid="status-loading-metro">
            <div className="metro-skeleton metro-skeleton--wide" /><div className="metro-skeleton" /><div className="metro-skeleton" />
            <span>Carregant estacions i servei…</span>
          </div>
        )}
        {error && (
          <div className="metro-state metro-error" role="alert" data-testid="status-metro-error">
            <strong>No s’ha pogut consultar el servei</strong>
            <span>{error}</span>
            <button type="button" onClick={() => void loadData(true)} data-testid="button-retry-metro">Torna-ho a provar</button>
          </div>
        )}
        {!loading && !error && data && !hasStations && (
          <div className="metro-state" data-testid="status-empty-metro">
            <strong>No hi ha estacions per mostrar</strong>
            <span>La resposta no conté estacions de metro. Actualitza per tornar-ho a provar.</span>
          </div>
        )}
        {data && !error && hasStations && (
          <div className="metro-lines">
            {filteredLines.map((line) => (
              <section className="metro-line" key={line.id} data-testid={`group-line-${line.id}`}>
                <header className="metro-line__header" style={{ '--line-color': line.color || '#b82732' } as React.CSSProperties}>
                  <span className="metro-line__badge" data-testid={`badge-line-${line.id}`}>{line.id}</span>
                  <div className="metro-line__identity">
                    <strong>Línia {line.id}</strong>
                    <span>{line.station_count} estacions a la xarxa</span>
                  </div>
                  <span className="metro-line__shown">{line.stations.length} mostrades</span>
                </header>
                <div className="metro-stations">
                  {line.stations.map((station) => {
                    const trainCount = station.destinations.reduce((total, destination) => total + destination.trains.length, 0);
                    return (
                      <details className={`metro-station ${station.found ? '' : 'is-not-found'}`} key={`${line.id}-${station.id}`} data-testid={`station-${station.id}`}>
                        <summary className="metro-station__summary">
                          <span className="metro-station__marker" style={{ '--line-color': line.color || '#b82732' } as React.CSSProperties} aria-hidden="true" />
                          <span className="metro-station__name" data-testid={`text-station-name-${station.id}`}>{station.name}</span>
                          <span className={`metro-station__availability ${station.found || credentialsMissing ? 'is-found' : 'is-missing'}`} data-testid={`status-station-${line.id}-${station.id}`}>
                            {credentialsMissing ? 'Referència' : station.found ? 'Operativa' : 'Sense dades'}
                          </span>
                          <span className="metro-station__arrival-count" data-testid={`count-arrivals-${line.id}-${station.id}`}>
                            {credentialsMissing ? '—' : `${trainCount} trens`}
                          </span>
                          <span className="metro-station__chevron" aria-hidden="true">⌄</span>
                        </summary>
                        <div className="metro-station__detail">
                          {station.destinations.length > 0 && !credentialsMissing ? (
                            <div className="metro-destinations">
                              {station.destinations.map((destination, destinationIndex) => (
                                <section className="metro-destination" key={`${destination.name}-${destinationIndex}`} data-testid={`destination-${line.id}-${station.id}-${destinationIndex}`}>
                                  <h4><span>Direcció</span>{destination.name}</h4>
                                  {destination.trains.length ? (
                                    <ul>
                                      {destination.trains.map((train, trainIndex) => (
                                        <li key={`${train.arrival_at}-${trainIndex}`} data-testid={`arrival-${line.id}-${station.id}-${destinationIndex}-${trainIndex}`}>
                                          <span className="metro-arrival__clock">{formatClock(train.arrival_at)}</span>
                                          <strong>{train.minutes_remaining <= 0 ? 'Ara' : `${train.minutes_remaining} min`}</strong>
                                          <small>{train.seconds_remaining > 0 ? `${numberFormat.format(train.seconds_remaining)} s` : 'Sortint'}</small>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : <p className="metro-no-arrivals">Sense arribades comunicades</p>}
                                </section>
                              ))}
                            </div>
                          ) : (
                            <p className="metro-detail-note" data-testid={`text-arrivals-unavailable-${line.id}-${station.id}`}>
                              {credentialsMissing
                                ? 'Les arribades en directe no estan disponibles fins que es configurin les credencials.'
                                : station.found ? 'No hi ha informació de destinacions per a aquesta estació.' : 'L’estació forma part del llistat de referència, però el servei no n’ha retornat dades.'}
                            </p>
                          )}
                          <div className="metro-station__metadata">
                            <span>Detalls de l’estació</span>
                            {Object.keys(station.details ?? {}).length ? (
                              <dl>
                                {Object.entries(station.details).map(([key, value]) => (
                                  <div key={key} data-testid={`detail-${line.id}-${station.id}-${key}`}>
                                    <dt>{key.replace(/[_-]/g, ' ')}</dt><dd>{formatDetail(value)}</dd>
                                  </div>
                                ))}
                              </dl>
                            ) : <p>El servei no ha proporcionat detalls addicionals.</p>}
                          </div>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </section>
            ))}
            {filteredLines.length === 0 && (
              <div className="metro-state" data-testid="status-no-search-results">
                <strong>No s’han trobat coincidències</strong><span>Prova amb un altre nom d’estació o identificador de línia.</span>
              </div>
            )}
          </div>
        )}
      </section>
      <footer className="metro-footnote" data-testid="text-refresh-policy">
        Consulta automàtica cada 60 segons. {data?.status === 'ok' ? `Resposta rebuda ${formatClock(data.fetched_at)}.` : 'Les hores d’arribada només es mostren quan el servei en directe està disponible.'}
      </footer>
    </main>
  );
};

export default AmbMetro;