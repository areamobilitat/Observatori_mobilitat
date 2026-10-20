// ─── TAB: INICI ───────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import MetricCard from '../components/MetricCard';
import TrafficMap from '../components/TrafficMap';
import './Dashboard.css';

interface Summary {
  total_incidents: number;
  percent_greus: number;
  via_mes_afectada?: { carretera: string; incidents: number } | null;
}

const Dashboard: React.FC = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/incidencies/summary')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setSummary(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="dashboard">
      <div className="dashboard-metrics">
        <MetricCard
          title="Total incidències actives"
          value={loading ? '…' : (summary?.total_incidents ?? '—')}
          color="info"
          subtitle="Xarxa viària de Catalunya"
        />
        <MetricCard
          title="Incidències greus (≥ N3)"
          value={loading ? '…' : (summary ? `${summary.percent_greus}%` : '—')}
          color={summary && summary.percent_greus > 20 ? 'danger' : 'warning'}
          subtitle="Del total d'incidències actives"
        />
        <MetricCard
          title="Via més afectada"
          value={loading ? '…' : (summary?.via_mes_afectada?.carretera ?? '—')}
          color="default"
          subtitle={summary?.via_mes_afectada ? `${summary.via_mes_afectada.incidents} incidències` : 'Sense dades'}
        />
        <MetricCard
          title="Font de dades"
          value="SCT"
          color="success"
          subtitle="Servei Català de Trànsit"
        />
      </div>
      <div className="dashboard-map-section">
        <div className="section-header">
          <h2>Mapa d'incidències en temps real</h2>
          <p>Dades actualitzades del Servei Català de Trànsit</p>
        </div>
        <TrafficMap />
      </div>
    </div>
  );
};

export default Dashboard;
