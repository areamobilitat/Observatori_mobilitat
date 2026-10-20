// ─── TAB: PROBABILITAT D'ACCIDENTS ─────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import './AccidentProbability.css';

interface ProbabilityRow {
  comarca: string;
  precipitacio_mitjana_mes_mm: number;
  precipitacio_disponible: boolean;
  accidents_previstos: number | null;
  probabilitat_nou_accident_pct: number | null;
  incidencies_temps_real: number;
}

interface ProbabilityPayload {
  generated_at: string;
  weather_date: string;
  month_start: string;
  weather_delay_days: number;
  quality: {
    without_coordinates: number;
    outside_comarca: number;
    comarques_with_weather: number;
    total_comarques: number;
  };
  summary: {
    average_probability_pct: number | null;
    highest_probability: ProbabilityRow | null;
    highest_incidents: ProbabilityRow | null;
    total_live_incidents: number;
  };
  results: ProbabilityRow[];
}

const risk = (value: number | null) => {
  if (value === null) return { label: 'Sense model', className: 'risk--unknown', color: '#7f8c8d' };
  if (value >= 80) return { label: 'Molt alt', className: 'risk--very-high', color: '#f2495c' };
  if (value >= 60) return { label: 'Alt', className: 'risk--high', color: '#ff7800' };
  if (value >= 35) return { label: 'Moderat', className: 'risk--medium', color: '#fade2a' };
  return { label: 'Baix', className: 'risk--low', color: '#73bf69' };
};

const formatDate = (value: string) => {
  try {
    return new Intl.DateTimeFormat('ca-ES', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const ProbabilityDashboard: React.FC<{ row: ProbabilityRow }> = ({ row }) => {
  const level = risk(row.probabilitat_nou_accident_pct);
  const probability = row.probabilitat_nou_accident_pct ?? 0;
  const precipitation = Math.min(100, Math.max(0, row.precipitacio_mitjana_mes_mm));

  return (
    <article className="prob-dashboard">
      <div className="prob-dashboard__top">
        <div>
          <div className="prob-dashboard__eyebrow">GRAFANA DASHBOARD · COMARCA</div>
          <h3>{row.comarca}</h3>
        </div>
        <span className={`prob-risk ${level.className}`}>
          <span className="prob-risk__dot" style={{ background: level.color }} />
          {level.label}
        </span>
      </div>

      <div className="prob-dashboard__metrics">
        <div className="prob-metric">
          <span className="prob-metric__label">Probabilitat ≥1 accident</span>
          <strong style={{ color: level.color }}>
            {row.probabilitat_nou_accident_pct === null ? 'n/d' : `${row.probabilitat_nou_accident_pct.toFixed(2)}%`}
          </strong>
          <span className="prob-metric__note">Model de Poisson</span>
        </div>
        <div className="prob-metric">
          <span className="prob-metric__label">Accidents previstos</span>
          <strong>{row.accidents_previstos === null ? 'n/d' : row.accidents_previstos.toFixed(2)}</strong>
          <span className="prob-metric__note">a = pluja · b = tendència</span>
        </div>
        <div className="prob-metric">
          <span className="prob-metric__label">Incidències SCT ara</span>
          <strong className={row.incidencies_temps_real > 0 ? 'prob-value--orange' : ''}>{row.incidencies_temps_real}</strong>
          <span className="prob-metric__note">Coordenades dins comarca</span>
        </div>
      </div>

      <div className="prob-dashboard__visuals">
        <div className="prob-gauge">
          <div className="prob-gauge__header">
            <span>Índex de probabilitat</span>
            <strong>{row.probabilitat_nou_accident_pct === null ? '—' : `${Math.round(probability)}%`}</strong>
          </div>
          <div className="prob-gauge__track">
            <div className="prob-gauge__fill" style={{ width: `${probability}%`, background: level.color }} />
          </div>
          <div className="prob-gauge__scale"><span>0%</span><span>50%</span><span>100%</span></div>
        </div>
        <div className="prob-weather">
          <div className="prob-weather__header">
            <span>Precipitació acumulada mensual</span>
            <strong>{row.precipitacio_mitjana_mes_mm.toFixed(2)} mm</strong>
          </div>
          <div className="prob-weather__track">
            <div className="prob-weather__fill" style={{ width: `${precipitation}%` }} />
          </div>
          <span className="prob-metric__note">
            {row.precipitacio_disponible ? 'Dada meteorològica disponible' : 'Sense dada meteorològica · referència 0 mm'}
          </span>
        </div>
      </div>

      <div className="prob-dashboard__footer">
        <span>● SCT LIVE</span>
        <span>Actualització per comarca</span>
      </div>
    </article>
  );
};

const AccidentProbability: React.FC = () => {
  const [payload, setPayload] = useState<ProbabilityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'probability' | 'incidents' | 'name'>('probability');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/probabilitat-accidents');
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'No s’han pogut carregar les dades.');
      setPayload(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Error de connexió amb l’API.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    const result = [...(payload?.results ?? [])].filter(row => {
      const matchesName = row.comarca.toLowerCase().includes(query.toLowerCase());
      const value = row.probabilitat_nou_accident_pct;
      const matchesRisk =
        riskFilter === 'all' ||
        (riskFilter === 'very-high' && value !== null && value >= 80) ||
        (riskFilter === 'high' && value !== null && value >= 60 && value < 80) ||
        (riskFilter === 'medium' && value !== null && value >= 35 && value < 60) ||
        (riskFilter === 'low' && value !== null && value < 35) ||
        (riskFilter === 'unknown' && value === null);
      return matchesName && matchesRisk;
    });
    result.sort((a, b) => {
      if (sortBy === 'name') return a.comarca.localeCompare(b.comarca, 'ca');
      if (sortBy === 'incidents') return b.incidencies_temps_real - a.incidencies_temps_real;
      return (b.probabilitat_nou_accident_pct ?? -1) - (a.probabilitat_nou_accident_pct ?? -1);
    });
    return result;
  }, [payload, query, riskFilter, sortBy]);

  return (
    <div className="probability-page">
      <section className="probability-hero">
        <div>
          <div className="probability-hero__kicker">RACC MOBILITY · PREDICTIVE MONITORING</div>
          <h2>Probabilitat d'accidents</h2>
          <p>
            Un dashboard Grafana per cada comarca, combinant precipitació acumulada,
            tendències històriques i incidències viàries en temps real.
          </p>
        </div>
        <button className="probability-refresh" onClick={load} disabled={loading}>
          {loading ? '⏳ Actualitzant…' : '↻ Actualitzar dades'}
        </button>
      </section>

      {payload && (
        <>
          <section className="probability-overview">
            <div className="probability-overview__title">
              <span>● PIPELINE ONLINE</span>
              <small>Generat {formatDate(payload.generated_at)}</small>
            </div>
            <div className="probability-kpis">
              <div><span>Probabilitat mitjana</span><strong>{payload.summary.average_probability_pct === null ? 'n/d' : `${payload.summary.average_probability_pct.toFixed(2)}%`}</strong></div>
              <div><span>Comarques monitoritzades</span><strong>{payload.quality.total_comarques}</strong><small>{payload.quality.comarques_with_weather} amb meteorologia</small></div>
              <div><span>Incidències geolocalitzades</span><strong>{payload.summary.total_live_incidents}</strong><small>{payload.quality.without_coordinates} sense coordenades</small></div>
              <div><span>Model meteorològic</span><strong>−{payload.weather_delay_days} dies</strong><small>Per retard de publicació</small></div>
            </div>
          </section>

          <section className="probability-toolbar">
            <div className="probability-toolbar__label">DASHBOARDS / {rows.length} RESULTATS</div>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="⌕ Cerca comarca…"
              aria-label="Cerca comarca"
            />
            <select value={riskFilter} onChange={event => setRiskFilter(event.target.value)} aria-label="Filtra per risc">
              <option value="all">Tots els riscos</option>
              <option value="very-high">Molt alt · ≥80%</option>
              <option value="high">Alt · 60–79%</option>
              <option value="medium">Moderat · 35–59%</option>
              <option value="low">Baix · &lt;35%</option>
              <option value="unknown">Sense model</option>
            </select>
            <select value={sortBy} onChange={event => setSortBy(event.target.value as typeof sortBy)} aria-label="Ordena dashboards">
              <option value="probability">Ordena: probabilitat</option>
              <option value="incidents">Ordena: incidències SCT</option>
              <option value="name">Ordena: comarca</option>
            </select>
          </section>
        </>
      )}

      {loading && (
        <div className="probability-state">
          <div className="probability-spinner" />
          <strong>Executant pipeline predictiu…</strong>
          <span>Consultant meteorologia, comarques i SCT. La primera actualització pot trigar uns segons.</span>
        </div>
      )}

      {error && !loading && (
        <div className="probability-state probability-state--error">
          <strong>No s'han pogut actualitzar els dashboards</strong>
          <span>{error}</span>
          <button onClick={load}>Tornar-ho a provar</button>
        </div>
      )}

      {!loading && !error && (
        <section className="probability-grid">
          {rows.map(row => <ProbabilityDashboard key={row.comarca} row={row} />)}
          {rows.length === 0 && <div className="probability-state"><strong>Cap comarca coincideix</strong><span>Canvia els filtres per veure més dashboards.</span></div>}
        </section>
      )}
    </div>
  );
};

export default AccidentProbability;