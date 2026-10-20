// ─── TAB NAVIGATION ───────────────────────────────────────────────────────────

import React from 'react';
import './Sidebar.css';

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeSection, onSectionChange }) => {
  const baseItems = [
    { id: 'inici', label: 'Inici' },
    { id: 'amb-metro', label: 'AMB-Metro' },
    { id: 'aforament', label: 'Aforament' },
    { id: 'sinistralitat', label: 'Sinistralitat' },
    { id: 'probabilitat', label: "Probabilitat d'accidents" },
    { id: 'registre', label: 'Registre' },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>RACC MOBILITY</h1>
        <h2>DATA HUB</h2>
      </div>
      <nav className="sidebar-menu">
        {baseItems.map(item => (
          <button
            key={item.id}
            className={`sidebar-item ${item.id === 'amb-metro' ? 'sidebar-item--metro' : ''} ${activeSection === item.id ? 'active' : ''}`}
            onClick={() => onSectionChange(item.id)}
            data-testid={`sidebar-tab-${item.id}`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default Sidebar;
