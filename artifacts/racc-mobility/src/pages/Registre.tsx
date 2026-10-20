// ─── TAB: REGISTRE ────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './Registre.css';

interface RegistryRow {
  id: number;
  status: 'Active' | 'Innactiu';
  identificador: string | null;
  tipus: string | null;
  subtipus: string | null;
  carretera: string | null;
  pk_inici: string | null;
  pk_fi: string | null;
  causa: string | null;
  data: string | null;
  data_final: string | null;
  nivell: string | null;
  sentit: string | null;
  descripcio: string | null;
  descripcio_tipus: string | null;
  font: string | null;
  cap_a: string | null;
  comarca: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

interface RegistryResponse {
  rows: RegistryRow[];
  active_count: number;
  inactive_count: number;
  total_count: number;
  last_refresh: string | null;
  refresh_interval_minutes: number;
  road_ratios: RoadRatio[];
  road_ratio_month_start: string;
  road_ratio_as_of: string;
  road_ratio_timezone: string;
}

interface RoadRatio {
  chart_row: number | null;
  carretera: string;
  pk_km: number | null;
  imd: number | null;
  accident_count: number;
  total_count: number;
  accident_ratio: number | null;
  accident_ratio_pct: number | null;
  message: string | null;
}

type TableKey =
  | 'id'
  | 'status'
  | 'comarca'
  | 'identificador'
  | 'tipus'
  | 'subtipus'
  | 'carretera'
  | 'pk_inici'
  | 'pk_fi'
  | 'causa'
  | 'data'
  | 'data_final'
  | 'nivell'
  | 'sentit'
  | 'descripcio'
  | 'descripcio_tipus'
  | 'font'
  | 'cap_a';

type FilterField =
  | 'all'
  | 'status'
  | 'identificador'
  | 'carretera'
  | 'causa'
  | 'comarca'
  | 'tipus'
  | 'subtipus'
  | 'nivell'
  | 'sentit'
  | 'descripcio'
  | 'data'
  | 'data_final';

interface RegistryFilter {
  id: number;
  field: FilterField;
  value: string;
}

const columns: { key: TableKey; label: string }[] = [
  { key: 'id', label: 'ID registre' },
  { key: 'status', label: 'Status' },
  { key: 'comarca', label: 'Comarca' },
  { key: 'identificador', label: 'Identificador SCT' },
  { key: 'tipus', label: 'Tipus' },
  { key: 'subtipus', label: 'Subtipus' },
  { key: 'carretera', label: 'Carretera' },
  { key: 'pk_inici', label: 'PK inici' },
  { key: 'pk_fi', label: 'PK fi' },
  { key: 'causa', label: 'Causa' },
  { key: 'data', label: 'Data d’inici' },
  { key: 'data_final', label: 'Data final' },
  { key: 'nivell', label: 'Nivell' },
  { key: 'sentit', label: 'Sentit' },
  { key: 'descripcio', label: 'Descripció' },
  { key: 'descripcio_tipus', label: 'Descripció tipus' },
  { key: 'font', label: 'Font' },
  { key: 'cap_a', label: 'Cap a' },
];

const filterFieldOptions: { value: FilterField; label: string }[] = [
  { value: 'all', label: 'Tots els camps' },
  { value: 'status', label: 'Status' },
  { value: 'identificador', label: 'Identificador SCT' },
  { value: 'carretera', label: 'Carretera' },
  { value: 'causa', label: 'Causa' },
  { value: 'comarca', label: 'Comarca' },
  { value: 'tipus', label: 'Tipus' },
  { value: 'subtipus', label: 'Subtipus' },
  { value: 'nivell', label: 'Nivell' },
  { value: 'sentit', label: 'Sentit' },
  { value: 'descripcio', label: 'Descripció' },
  { value: 'data', label: 'Data d’inici' },
  { value: 'data_final', label: 'Data final' },
];

const formatDate = (value: string | null) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('ca-ES', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const displayValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
};

const formatRatio = (value: number | null) => {
  if (value === null) return '—';
  return `${new Intl.NumberFormat('ca-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)}%`;
};

const formatMonthDate = (value: string) => {
  try {
    return new Intl.DateTimeFormat('ca-ES', {
      day: 'numeric',
      month: 'long',
    }).format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
};

const filterFieldLabel = (field: FilterField) =>
  filterFieldOptions.find(option => option.value === field)?.label ?? 'Tots els camps';

const rowFilterText = (row: RegistryRow, field: FilterField) => {
  if (field === 'all') {
    return columns.map(column => displayValue(row[column.key])).join(' ');
  }
  if (field === 'status') return row.status;
  return displayValue(row[field]);
};

const csvEscape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const Registre: React.FC = () => {
  const [registry, setRegistry] = useState<RegistryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteInactiveBusy, setDeleteInactiveBusy] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [filterField, setFilterField] = useState<FilterField>('all');
  const [filterValue, setFilterValue] = useState('');
  const [filters, setFilters] = useState<RegistryFilter[]>([]);
  const nextFilterId = useRef(0);

  const loadRegistry = useCallback(async (showSpinner = true) => {
    if (showSpinner) setRefreshing(true);
    setError(null);
    try {
      const response = await fetch('/api/registre');
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'No s’ha pogut carregar el registre.');
      setRegistry(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Error de connexió amb l’API.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadRegistry();
    const refreshTimer = window.setInterval(() => {
      void loadRegistry(false);
    }, 30 * 60 * 1000);
    return () => window.clearInterval(refreshTimer);
  }, [loadRegistry]);

  const deleteInactiveRows = useCallback(async () => {
    const inactiveCount = registry?.inactive_count ?? 0;
    if (inactiveCount === 0 || deleteInactiveBusy) return;
    const confirmed = window.confirm(
      `Vols eliminar permanentment ${inactiveCount} incidències inactives? Aquesta acció no es pot desfer.`
    );
    if (!confirmed) return;

    setDeleteInactiveBusy(true);
    setDeleteMessage(null);
    setError(null);
    try {
      const response = await fetch('/api/registre/inactives', { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'No s’han pogut eliminar les incidències inactives.');
      setDeleteMessage(`S’han eliminat ${data.deleted_count} incidències inactives.`);
      await loadRegistry(false);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Error en eliminar les incidències inactives.');
    } finally {
      setDeleteInactiveBusy(false);
    }
  }, [registry, deleteInactiveBusy, loadRegistry]);

  const addFilter = useCallback(() => {
    const value = filterValue.trim();
    if (!value) return;

    setFilters(previous => [
      ...previous,
      { id: nextFilterId.current++, field: filterField, value },
    ]);
    setFilterValue('');
  }, [filterField, filterValue]);

  const filterSuggestions = useMemo(() => {
    if (filterField === 'all' || !registry) return [];

    return Array.from(
      new Set(
        registry.rows
          .map(row => rowFilterText(row, filterField))
          .filter(value => value && value !== '—'),
      ),
    )
      .sort((a, b) => a.localeCompare(b, 'ca'))
      .slice(0, 100);
  }, [registry, filterField]);

  const visibleRows = useMemo(() => {
    return (registry?.rows ?? []).filter(row =>
      filters.every(filter =>
        rowFilterText(row, filter.field).toLowerCase().includes(filter.value.toLowerCase()),
      ),
    );
  }, [registry, filters]);

  const downloadFilteredCsv = useCallback(() => {
    if (visibleRows.length === 0) return;

    const header = columns.map(column => csvEscape(column.label)).join(';');
    const rows = visibleRows.map(row =>
      columns
        .map(column => {
          if (column.key === 'data_final') return csvEscape(row.data_final);
          return csvEscape(row[column.key]);
        })
        .join(';'),
    );
    const csv = `\ufeff${[header, ...rows].join('\r\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `registre-incidencies-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [visibleRows]);

  return (
    <div className="registry-page">
      <section className="registry-hero">
        <div>
          <div className="registry-hero__kicker">RACC MOBILITY · LIVE INCIDENT HISTORY</div>
          <h2>Registre</h2>
          <p>
            Històric persistent de les incidències publicades pel SCT. Cada fila
            conserva el seu ID únic encara que deixi d’aparèixer al feed.
          </p>
        </div>
        <div className="registry-refresh-status">
          <span className="registry-live-dot" />
          <div>
            <strong>Sincronització automàtica</strong>
            <small>Cada 30 minuts</small>
          </div>
          <button onClick={() => void loadRegistry()} disabled={refreshing}>
            {refreshing ? '⏳' : '↻'} Actualitzar vista
          </button>
        </div>
      </section>

      {registry && (
        <section className="registry-overview">
          <div className="registry-kpi registry-kpi--blue">
            <span>Total registres</span>
            <strong>{registry.total_count}</strong>
            <small>Incidències conservades</small>
          </div>
          <div className="registry-kpi registry-kpi--green">
            <span>Active</span>
            <strong>{registry.active_count}</strong>
            <small>Detectades en l’última actualització</small>
          </div>
          <div className="registry-kpi registry-kpi--red">
            <span>Innactiu</span>
            <strong>{registry.inactive_count}</strong>
            <small>Ja no apareixen al feed SCT</small>
          </div>
          <div className="registry-kpi registry-kpi--purple">
            <span>Última comprovació</span>
            <strong>{registry.last_refresh ? formatDate(registry.last_refresh) : '—'}</strong>
            <small>La pròxima es farà en 30 minuts</small>
          </div>
        </section>
      )}

      {registry && (
        <section className="registry-ratios-card">
          <div className="registry-ratios-header">
            <div>
              <span className="registry-ratios-kicker">ANÀLISI DEL MES ACTUAL</span>
              <h3>Taxa d’accidents per carretera</h3>
              <p>
                Accidents ({'Causa = Accident'}) dividits pel total d’incidències
                de la mateixa carretera, del {formatMonthDate(registry.road_ratio_month_start)} fins avui.
              </p>
            </div>
            <div className="registry-ratios-meta">
              <strong>{registry.road_ratios.length} files</strong>
              <small>Màxim dues files per carretera · llista IMD</small>
            </div>
          </div>
          <div className="registry-ratios-scroll">
            <table className="registry-ratios-table">
              <thead>
                <tr>
                  <th>Carretera</th>
                  <th>PK</th>
                  <th>Accidents</th>
                  <th>Total incidències</th>
                  <th>Taxa d’accidents</th>
                </tr>
              </thead>
              <tbody>
                {registry.road_ratios.map(road => (
                  <tr key={`${road.chart_row ?? road.carretera}-${road.pk_km ?? 'pk'}`}>
                    <td className="registry-ratio-road">{road.carretera}</td>
                    <td>{road.pk_km ?? '—'}</td>
                    <td>{road.accident_count}</td>
                    <td>{road.total_count}</td>
                    <td>
                      {road.message ? (
                        <span className="registry-ratio-empty">{road.message}</span>
                      ) : (
                        <strong className="registry-ratio-value">
                          {formatRatio(road.accident_ratio_pct)}
                        </strong>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="registry-table-card">
        <div className="registry-table-toolbar">
          <div>
            <strong>Taula d’incidències</strong>
            <span>{visibleRows.length} files visibles · coordenades excloses</span>
          </div>
          <div className="registry-toolbar-actions">
            <button
              type="button"
              className="registry-delete-button"
              onClick={() => void deleteInactiveRows()}
              disabled={loading || deleteInactiveBusy || !registry || registry.inactive_count === 0}
              title="Elimina permanentment totes les incidències inactives"
            >
              {deleteInactiveBusy ? 'Eliminant…' : `Eliminar inactives (${registry?.inactive_count ?? 0})`}
            </button>
            <button
              type="button"
              className="registry-download-button"
              onClick={downloadFilteredCsv}
              disabled={loading || visibleRows.length === 0}
              title="Descarrega només les incidències que coincideixen amb els filtres actius"
            >
              ⇩ Descarregar <span>({visibleRows.length})</span>
            </button>
            <div className="registry-filter-builder">
              <div className="registry-filter-entry">
                <select
                  value={filterField}
                  onChange={event => setFilterField(event.target.value as FilterField)}
                  aria-label="Categoria del filtre"
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
                  list="registry-filter-values"
                  placeholder="Escriu un valor i prem Enter…"
                  aria-label="Valor del filtre"
                />
                <datalist id="registry-filter-values">
                  {filterSuggestions.map(suggestion => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
                <button type="button" onClick={addFilter} disabled={!filterValue.trim()}>
                  + Afegir
                </button>
              </div>
              {filters.length > 0 && (
                <div className="registry-active-filters">
                  <span className="registry-filter-caption">Filtres actius</span>
                  {filters.map(filter => (
                    <span className="registry-filter-chip" key={filter.id}>
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
                  <button type="button" className="registry-clear-filters" onClick={() => setFilters([])}>
                    Neteja filtres
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {deleteMessage && (
          <div className="registry-delete-message" role="status">
            <span>{deleteMessage}</span>
            <button type="button" onClick={() => setDeleteMessage(null)} aria-label="Tanca el missatge">×</button>
          </div>
        )}

        {loading && (
          <div className="registry-state">
            <div className="registry-spinner" />
            <strong>Carregant el registre SCT…</strong>
            <span>La primera sincronització pot trigar uns segons.</span>
          </div>
        )}

        {error && !loading && (
          <div className="registry-state registry-state--error">
            <strong>No s’ha pogut carregar el registre</strong>
            <span>{error}</span>
            <button onClick={() => void loadRegistry()}>Tornar-ho a provar</button>
          </div>
        )}

        {!loading && !error && (
          <div className="registry-table-scroll">
            <table className="registry-table">
              <thead>
                <tr>{columns.map(column => <th key={column.key}>{column.label}</th>)}</tr>
              </thead>
              <tbody>
                {visibleRows.map(row => (
                  <tr key={row.id} className={row.status === 'Innactiu' ? 'registry-row--inactive' : ''}>
                    {columns.map(column => {
                      const value = row[column.key];
                      if (column.key === 'status') {
                        return (
                          <td key={column.key}>
                            <span className={`registry-status registry-status--${row.status === 'Active' ? 'active' : 'inactive'}`}>
                              <span />{row.status}
                            </span>
                          </td>
                        );
                      }
                      if (column.key === 'data_final') {
                        return (
                          <td key={column.key} className={`registry-cell--${column.key}`}>
                            {row.data_final ? formatDate(row.data_final) : ''}
                          </td>
                        );
                      }
                      return (
                        <td key={column.key} className={`registry-cell--${column.key}`}>
                          {displayValue(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleRows.length === 0 && (
              <div className="registry-empty">
                <span>◌</span>
                <strong>Cap incidència coincideix amb els filtres</strong>
                <small>Prova una altra cerca o selecciona “Tots els status”.</small>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="registry-note">
        <span>ℹ</span>
        <p>
          <strong>Com funciona:</strong> el sistema compara el feed SCT cada 30 minuts.
          Les incidències noves reben el següent ID de registre disponible; les que
          desapareixen conserven totes les seves dades i passen a <em>Innactiu</em>.
        </p>
      </div>
    </div>
  );
};

export default Registre;