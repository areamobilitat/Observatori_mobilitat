// ─── TAB: FACTORS EXTERNS ─────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import './Factors.css';

interface FactorCard { title: string; value: string; description: string; color: string; }

const WEATHER_FACTORS: FactorCard[] = [
  { title: 'Pluja', value: 'Possible', description: 'Condicions de pluja poden reduir la visibilitat i augmentar el risc d\'accidents.', color: '#3498db' },
  { title: 'Boira', value: 'Baixa', description: 'Nivells de boira reduïts. Visibilitat acceptable a la majoria de trams.', color: '#95a5a6' },
  { title: 'Vent', value: 'Moderat', description: 'Vent moderat. Precaució amb vehicles d\'alt perfil en trams exposats.', color: '#e67e22' },
  { title: 'Gel / Neu', value: 'Risc baix', description: 'Temperatures sobre zero. No s\'espera formació de gel a la calçada.', color: '#2980b9' },
  { title: 'Enlluernament', value: 'Possible matí', description: 'El sol baix al matí pot provocar enlluernament. Porta les ulleres de sol.', color: '#f39c12' },
  { title: 'Temperatura', value: '18°C', description: 'Temperatura agradable. Condicions normals de conducció.', color: '#e74c3c' },
];

const TRAFFIC_FACTORS: FactorCard[] = [
  { title: 'Esdeveniments', value: '2 actius', description: 'Esdeveniments esportius/culturals que poden afectar la circulació a l\'AMB.', color: '#8e44ad' },
  { title: 'Obres viàries', value: '12 trams', description: 'Obres en curs a la xarxa viària. Revisa els trams afectats al mapa.', color: '#e67e22' },
  { title: 'Horari escolar', value: 'Actiu', description: 'Horari d\'entrada/sortida escolar. Precaució en zones residencials.', color: '#27ae60' },
  { title: 'Transport públic', value: 'Operatiu', description: 'Serveis de bus i metro operant amb normalitat.', color: '#3498db' },
];

const Factors: React.FC = () => {
  const [incidencies, setIncidencies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'meteo' | 'traffic'>('meteo');

  useEffect(() => {
    fetch('/api/incidencies/raw')
      .then(r => r.json())
      .then(d => setIncidencies(d.incidencies ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Count incidents by cause to see weather-related ones
  const causaCounts: Record<string, number> = {};
  incidencies.forEach(i => {
    const c = String(i.causa || 'desconeguda');
    causaCounts[c] = (causaCounts[c] ?? 0) + 1;
  });
  const topCauses = Object.entries(causaCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="factors">
      <div className="factors-tabs">
        <button
          className={`tab-btn ${activeTab === 'meteo' ? 'active' : ''}`}
          onClick={() => setActiveTab('meteo')}
        >
          Factors meteorològics
        </button>
        <button
          className={`tab-btn ${activeTab === 'traffic' ? 'active' : ''}`}
          onClick={() => setActiveTab('traffic')}
        >
          Factors de trànsit
        </button>
      </div>

      <div className="factors-grid">
        {(activeTab === 'meteo' ? WEATHER_FACTORS : TRAFFIC_FACTORS).map(f => (
          <div key={f.title} className="factor-card" style={{ borderLeftColor: f.color }}>
            <div className="factor-card__header">
              <div>
                <h4>{f.title}</h4>
                <span className="factor-card__value" style={{ color: f.color }}>{f.value}</span>
              </div>
            </div>
            <p className="factor-card__desc">{f.description}</p>
          </div>
        ))}
      </div>

      {topCauses.length > 0 && (
        <div className="factors-causes">
          <h3>Causes principals d'incidents (temps real SCT)</h3>
          <div className="causes-list">
            {topCauses.map(([causa, count]) => (
              <div key={causa} className="cause-item">
                <span className="cause-label">{causa}</span>
                <div className="cause-bar-wrap">
                  <div
                    className="cause-bar"
                    style={{ width: `${Math.min(100, (count / topCauses[0][1]) * 100)}%` }}
                  />
                </div>
                <span className="cause-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Factors;
