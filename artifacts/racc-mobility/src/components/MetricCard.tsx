import React from 'react';
import './MetricCard.css';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: 'default' | 'warning' | 'danger' | 'success' | 'info';
  trend?: { value: number; label: string };
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  color = 'default',
  trend,
}) => {
  return (
    <div className={`metric-card metric-card--${color}`}>
      <div className="metric-card__header">
        <p className="metric-card__title">{title}</p>
      </div>
      <div className="metric-card__value">{value}</div>
      {subtitle && <p className="metric-card__subtitle">{subtitle}</p>}
      {trend && (
        <div className={`metric-card__trend ${trend.value >= 0 ? 'up' : 'down'}`}>
          {trend.value >= 0 ? '▲' : '▼'} {Math.abs(trend.value)}% {trend.label}
        </div>
      )}
    </div>
  );
};

export default MetricCard;
