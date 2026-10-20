import React, { useEffect, useState, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import './GrafanaDashboard.css';

/* ── palette ─────────────────────────────────────────────── */
const G = {
  orange: '#ff7800',
  blue:   '#5794f2',
  green:  '#73bf69',
  yellow: '#fade2a',
  red:    '#f2495c',
  purple: '#b877d9',
  teal:   '#37872d',
  bg:     '#111217',
  panel:  '#181b1f',
  border: '#2c2e33',
  text:   '#d8d9da',
  muted:  '#8e8e8e',
};
const PIE_COLORS = [G.orange, G.blue, G.green, G.yellow, G.red, G.purple, G.teal, '#e0b400'];

/* ── custom tooltip ──────────────────────────────────────── */
const GTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1e2028', border: `1px solid ${G.border}`, padding: '8px 12px', borderRadius: 4, fontSize: 12 }}>
      {label && <div style={{ color: G.muted, marginBottom: 4 }}>{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color || G.text }}>
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
};

/* ── stat panel ─────────────────────────────────────────── */
const StatPanel = ({ title, value, unit, color, sub }: any) => (
  <div className="gf-panel gf-stat">
    <div className="gf-panel__title">{title}</div>
    <div className="gf-stat__value" style={{ color }}>{value}<span className="gf-stat__unit">{unit}</span></div>
    {sub && <div className="gf-stat__sub">{sub}</div>}
  </div>
);

/* ── main ────────────────────────────────────────────────── */
export default function GrafanaDashboard() {
  const [summary,  setSummary]  = useState<any>(null);
  const [byTipo,   setByTipo]   = useState<Record<string,number>>({});
  const [byNivel,  setByNivel]  = useState<Record<string,number>>({});
  const [ranking,  setRanking]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t, n, rk] = await Promise.all([
        fetch('/api/incidencies/summary').then(r => r.json()),
        fetch('/api/incidencies/by_tipo').then(r => r.json()),
        fetch('/api/incidencies/by_nivel').then(r => r.json()),
        fetch('/api/incidencies/ranking_trams').then(r => r.json()),
      ]);
      setSummary(s);
      setByTipo(t.by_tipo ?? {});
      setByNivel(n.by_nivel ?? {});
      setRanking(rk.ranking ?? []);
    } catch { /* silently ignore */ }
    finally { setLoading(false); setLastRefresh(new Date()); }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── derived chart data ── */
  const pieData = Object.entries(byTipo)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const barData = Object.entries(byNivel)
    .map(([n, v]) => ({
      name: `N${n}`,
      value: Number(v),
      fill: Number(n) >= 4 ? G.red : Number(n) === 3 ? G.orange : Number(n) === 2 ? G.yellow : G.green,
    }))
    .sort((a, b) => parseInt(a.name.slice(1)) - parseInt(b.name.slice(1)));

  const topRoads = ranking.slice(0, 10).map(r => ({ name: r.carretera, value: r.incidents }));

  /* simulate a time-series with rolling counts */
  const hours = Array.from({ length: 24 }, (_, i) => {
    const base = summary?.total_incidents ?? 0;
    const noise = Math.round(Math.sin(i / 3) * (base * 0.15) + (base * 0.85));
    return { time: `${String(i).padStart(2,'0')}:00`, incidents: Math.max(0, noise) };
  });

  const timeStr = lastRefresh.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="gf-root">
      {/* ── top bar ── */}
      <header className="gf-topbar">
        <div className="gf-topbar__left">
          <svg className="gf-logo" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke={G.orange} strokeWidth="2"/>
            <path d="M8 12h8M12 8v8" stroke={G.orange} strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span className="gf-topbar__title">RACC Mobility · Sinistralitat</span>
          <span className="gf-topbar__tag">SCT Live</span>
        </div>
        <div className="gf-topbar__right">
          {loading && <span className="gf-loading-dot" />}
          <div className="gf-timepicker">
            <span>⏱</span>
            <span>Last 24h</span>
            <span className="gf-timepicker__chevron">▾</span>
          </div>
          <button className="gf-btn-refresh" onClick={load} title="Refresh">↻</button>
          <span className="gf-last-refresh">Last refreshed: {timeStr}</span>
        </div>
      </header>

      {/* ── dashboard grid ── */}
      <div className="gf-grid">

        {/* row 1: stats */}
        <StatPanel
          title="Total incidents actius"
          value={loading ? '…' : (summary?.total_incidents ?? '—')}
          unit=" inc"
          color={G.orange}
          sub="Xarxa viària de Catalunya"
        />
        <StatPanel
          title="Incidents greus (≥ N3)"
          value={loading ? '…' : (summary ? `${summary.percent_greus}` : '—')}
          unit="%"
          color={summary?.percent_greus > 20 ? G.red : G.yellow}
          sub="Del total d'incidents actius"
        />
        <StatPanel
          title="Via més afectada"
          value={loading ? '…' : (summary?.via_mes_afectada?.carretera ?? '—')}
          unit=""
          color={G.blue}
          sub={summary?.via_mes_afectada ? `${summary.via_mes_afectada.incidents} inc` : ''}
        />
        <StatPanel
          title="Tipus d'incidents"
          value={loading ? '…' : Object.keys(byTipo).length}
          unit=" cat"
          color={G.green}
          sub="Categories detectades"
        />

        {/* row 2: time series (full width) */}
        <div className="gf-panel gf-span-4">
          <div className="gf-panel__title">
            Evolució d'incidents · últimes 24 h
            <span className="gf-panel__badge">simulat</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={hours} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gfArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={G.orange} stopOpacity={0.35}/>
                  <stop offset="95%" stopColor={G.orange} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={G.border} />
              <XAxis dataKey="time" tick={{ fill: G.muted, fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
              <YAxis tick={{ fill: G.muted, fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
              <Tooltip content={<GTooltip />} />
              <Area type="monotone" dataKey="incidents" stroke={G.orange} strokeWidth={2} fill="url(#gfArea)" name="Incidents" dot={false} activeDot={{ r: 4, fill: G.orange }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* row 3: pie + severity bar */}
        <div className="gf-panel gf-span-2">
          <div className="gf-panel__title">Incidents per tipus</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name">
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<GTooltip />} />
              <Legend iconType="circle" iconSize={8} formatter={(v: string) => <span style={{ color: G.muted, fontSize: 11 }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="gf-panel gf-span-2">
          <div className="gf-panel__title">Incidents per nivell de severitat</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ top: 8, right: 16, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={G.border} />
              <XAxis dataKey="name" tick={{ fill: G.muted, fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: G.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={30} />
              <Tooltip content={<GTooltip />} />
              <Bar dataKey="value" name="Incidents" radius={[3, 3, 0, 0]}>
                {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* row 4: top roads bar */}
        <div className="gf-panel gf-span-4">
          <div className="gf-panel__title">Top 10 carreteres amb més incidents</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topRoads} layout="vertical" margin={{ top: 4, right: 20, left: 50, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={G.border} horizontal={false} />
              <XAxis type="number" tick={{ fill: G.muted, fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis dataKey="name" type="category" tick={{ fill: G.text, fontSize: 11 }} tickLine={false} axisLine={false} width={50} />
              <Tooltip content={<GTooltip />} />
              <Bar dataKey="value" name="Incidents" fill={G.blue} radius={[0, 3, 3, 0]} background={{ fill: 'rgba(255,255,255,0.03)', radius: 3 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* ── footer ── */}
      <footer className="gf-footer">
        <span>Grafana — RACC Mobility Data Hub</span>
        <span>Font: Servei Català de Trànsit (SCT) · Dades en temps real</span>
        <span>© {new Date().getFullYear()} RACC</span>
      </footer>
    </div>
  );
}
