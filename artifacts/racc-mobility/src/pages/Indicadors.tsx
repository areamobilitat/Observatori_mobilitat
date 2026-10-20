// ─── TAB: INDICADORS ──────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { IncidentsByTypeChart, IncidentsBySeverityChart, TopRoadsChart } from '../components/Charts';
import MetricCard from '../components/MetricCard';
import './Indicadors.css';

const Indicadors: React.FC = () => {
  const [byTipo, setByTipo] = useState<Record<string, number>>({});
  const [byNivel, setByNivel] = useState<Record<string, number>>({});
  const [ranking, setRanking] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/incidencies/by_tipo').then(r => r.json()),
      fetch('/api/incidencies/by_nivel').then(r => r.json()),
      fetch('/api/incidencies/ranking_trams').then(r => r.json()),
      fetch('/api/incidencies/summary').then(r => r.json()),
    ])
      .then(([t, n, rk, s]) => {
        setByTipo(t.by_tipo ?? {});
        setByNivel(n.by_nivel ?? {});
        setRanking(rk.ranking ?? []);
        setSummary(s);
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

  return (
    <div className="indicadors">
      <div className="indicadors-metrics">
        <MetricCard
          title="Total incidències"
          value={loading ? '…' : (summary?.total_incidents ?? '—')}
          color="info"
        />
        <MetricCard
          title="Tipus detectats"
          value={loading ? '…' : Object.keys(byTipo).length}
          color="default"
          subtitle="Categories d'incidents"
        />
        <MetricCard
          title="Nivells de severitat"
          value={loading ? '…' : Object.keys(byNivel).length}
          color="warning"
          subtitle="Escala 1-4"
        />
        <MetricCard
          title="Vies monitoritzades"
          value={loading ? '…' : ranking.length}
          color="success"
          subtitle="Carreteres amb incidències"
        />
      </div>

      <div className="indicadors-charts">
        {pieData.length > 0 && <IncidentsByTypeChart data={pieData} />}
        {barData.length > 0 && <IncidentsBySeverityChart data={barData} />}
      </div>

      {roadData.length > 0 && <TopRoadsChart data={roadData} />}

      {loading && (
        <div className="indicadors-loading">
          <div className="loading-spinner" />
          <p>Carregant indicadors de trànsit…</p>
        </div>
      )}
    </div>
  );
};

export default Indicadors;
