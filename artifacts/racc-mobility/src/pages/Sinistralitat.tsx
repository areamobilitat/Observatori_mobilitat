// ─── TAB: SINISTRALITAT ───────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import MetricCard from '../components/MetricCard';
import { IncidentsByTypeChart, IncidentsBySeverityChart, TopRoadsChart } from '../components/Charts';
import './Sinistralitat.css';

interface Summary { total_incidents: number; percent_greus: number; via_mes_afectada?: { carretera: string; incidents: number } | null; }
interface RankingItem { carretera: string; incidents: number; max_nivel: number; tipo_principal?: string | null; }
type ByTipo = Record<string, number>;
type ByNivel = Record<string, number>;

const GRAFANA_EMBED_URL = `${window.location.origin}${import.meta.env.BASE_URL}?view=grafana`;

const Sinistralitat: React.FC = () => {
  const [grafanaExpanded, setGrafanaExpanded] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byTipo, setByTipo] = useState<ByTipo>({});
  const [byNivel, setByNivel] = useState<ByNivel>({});
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [filterRoad, setFilterRoad] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/incidencies/summary').then(r => r.json()),
      fetch('/api/incidencies/by_tipo').then(r => r.json()),
      fetch('/api/incidencies/by_nivel').then(r => r.json()),
      fetch('/api/incidencies/ranking_trams').then(r => r.json()),
    ])
      .then(([s, t, n, rk]) => {
        setSummary(s);
        setByTipo(t.by_tipo ?? {});
        setByNivel(t.by_nivel ?? n.by_nivel ?? {});
        // nivel comes from by_nivel endpoint
        if (n.by_nivel) setByNivel(n.by_nivel);
        setRanking(rk.ranking ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pieData = Object.entries(byTipo)
    .map(([name, value]) => ({ name: String(name), value: Number(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const barData = Object.entries(byNivel)
    .map(([name, value]) => ({ name: `N${name}`, value: Number(value) }))
    .sort((a, b) => parseInt(a.name.slice(1)) - parseInt(b.name.slice(1)));

  const roadData = ranking.map(r => ({ name: r.carretera, value: r.incidents }));

  const filteredRanking = ranking.filter(r => {
    const roadOk = !filterRoad || r.carretera.toLowerCase().includes(filterRoad.toLowerCase());
    const typeOk = !filterType || String(r.tipo_principal ?? '').toLowerCase().includes(filterType.toLowerCase());
    const levelOk = !filterLevel || String(r.max_nivel) === filterLevel;
    return roadOk && typeOk && levelOk;
  });

  const levelLabel = (n: number) => {
    if (n >= 4) return { label: 'Molt greu', cls: 'nivel--4' };
    if (n === 3) return { label: 'Greu', cls: 'nivel--3' };
    if (n === 2) return { label: 'Moderat', cls: 'nivel--2' };
    return { label: 'Lleu', cls: 'nivel--1' };
  };

  return (
    <div className="sinistralitat">

      {/* ── Grafana embed ── */}
      <div className="grafana-embed-wrapper">
        <div className="grafana-embed-header" onClick={() => setGrafanaExpanded(e => !e)}>
          <div className="grafana-embed-header__left">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" stroke="#ff7800" strokeWidth="2"/>
              <path d="M8 12h8M12 8v8" stroke="#ff7800" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span className="grafana-embed-header__title">Grafana · RACC Mobility Dashboard</span>
            <span className="grafana-embed-header__live">● LIVE</span>
          </div>
          
          </div>
        </div>
        {grafanaExpanded && (
          <iframe
            src={GRAFANA_EMBED_URL}
            className="grafana-iframe"
            title="Grafana Dashboard"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin"
          />
        )}
      </div>

      {/* KPIs */}
      <div className="sinistralitat-metrics">
        <MetricCard
          title="Total incidències"
          value={loading ? '…' : (summary?.total_incidents ?? '—')}
          color="info"
          subtitle="Tram de la xarxa viària"
        />
        <MetricCard
          title="Incidències greus (≥N3)"
          value={loading ? '…' : (summary ? `${summary.percent_greus}%` : '—')}
          color={summary && summary.percent_greus > 20 ? 'danger' : 'warning'}
          subtitle="Percentatge del total"
        />
        <MetricCard
          title="Via més afectada"
          value={loading ? '…' : (summary?.via_mes_afectada?.carretera ?? '—')}
          color="default"
          subtitle={summary?.via_mes_afectada ? `${summary.via_mes_afectada.incidents} incidències` : 'Sense dades'}
        />
        <MetricCard
          title="Tipus d'incidents"
          value={loading ? '…' : Object.keys(byTipo).length}
          color="success"
          subtitle="Categories detectades"
        />
      </div>

      {/* Charts */}
      <div className="sinistralitat-charts">
        {pieData.length > 0 && <IncidentsByTypeChart data={pieData} />}
        {barData.length > 0 && <IncidentsBySeverityChart data={barData} />}
      </div>
      {roadData.length > 0 && (
        <div className="sinistralitat-road-chart">
          <TopRoadsChart data={roadData} />
        </div>
      )}

      {/* Ranking table */}
      <div className="sinistralitat-ranking">
        <h3>Rànquing de trams afectats</h3>
        <div className="ranking-filters">
          <input
            type="text" placeholder="🔍 Carretera…"
            value={filterRoad} onChange={e => setFilterRoad(e.target.value)}
          />
          <input
            type="text" placeholder="🔍 Tipus…"
            value={filterType} onChange={e => setFilterType(e.target.value)}
          />
          <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)}>
            <option value="">Tots els nivells</option>
            <option value="1">Nivell 1 – Lleu</option>
            <option value="2">Nivell 2 – Moderat</option>
            <option value="3">Nivell 3 – Greu</option>
            <option value="4">Nivell 4 – Molt greu</option>
          </select>
        </div>
        <div className="ranking-table-wrapper">
          <table className="ranking-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Carretera</th>
                <th>Incidents</th>
                <th>Màx. nivell</th>
                <th>Tipus principal</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="table-loading">Carregant…</td></tr>
              ) : filteredRanking.length === 0 ? (
                <tr><td colSpan={5} className="table-empty">Cap resultat</td></tr>
              ) : (
                filteredRanking.map((r, i) => {
                  const lv = levelLabel(r.max_nivel);
                  return (
                    <tr key={r.carretera}>
                      <td className="rank-num">{i + 1}</td>
                      <td><strong>{r.carretera}</strong></td>
                      <td>{r.incidents}</td>
                      <td><span className={`nivel-badge ${lv.cls}`}>{lv.label} (N{r.max_nivel})</span></td>
                      <td>{r.tipo_principal ?? '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Severity guide */}
      <div className="severity-guide">
        <h4>Guia de nivells de severitat</h4>
        <div className="severity-items">
          {[
            { n: 1, label: 'Lleu', desc: 'Afectació mínima al trànsit', color: '#27ae60' },
            { n: 2, label: 'Moderat', desc: 'Retencions i reducció de velocitat', color: '#f39c12' },
            { n: 3, label: 'Greu', desc: 'Tall parcial o interrupció', color: '#e67e22' },
            { n: 4, label: 'Molt greu', desc: 'Tall total o emergència viària', color: '#e74c3c' },
          ].map(s => (
            <div key={s.n} className="severity-item">
              <div className="severity-dot" style={{ background: s.color }} />
              <div>
                <strong>N{s.n} – {s.label}</strong>
                <p>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Sinistralitat;
