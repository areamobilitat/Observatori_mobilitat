import React from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import './Charts.css';

const COLORS = ['#1a1a2e', '#0f3460', '#e94560', '#f4d03f', '#27ae60', '#3498db', '#e67e22', '#8e44ad'];

interface BarData { name: string; value: number; }
interface PieData { name: string; value: number; }

export const IncidentsByTypeChart: React.FC<{ data: PieData[] }> = ({ data }) => (
  <div className="chart-container">
    <h3 className="chart-title">Incidències per tipus</h3>
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={100}
          dataKey="value"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v: number) => [v, 'Incidències']} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  </div>
);

export const IncidentsBySeverityChart: React.FC<{ data: BarData[] }> = ({ data }) => (
  <div className="chart-container">
    <h3 className="chart-title">Incidències per nivell de severitat</h3>
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip formatter={(v: number) => [v, 'Incidències']} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {data.map((entry, i) => {
            const n = parseInt(entry.name, 10);
            const color = n >= 4 ? '#e74c3c' : n === 3 ? '#e67e22' : n === 2 ? '#f39c12' : '#27ae60';
            return <Cell key={i} fill={color} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
);

export const TopRoadsChart: React.FC<{ data: BarData[] }> = ({ data }) => (
  <div className="chart-container">
    <h3 className="chart-title">Top carreteres afectades</h3>
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={60} />
        <Tooltip formatter={(v: number) => [v, 'Incidències']} />
        <Bar dataKey="value" fill="#1a1a2e" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>
);
