// ─── APP SHELL + TAB ROUTING ──────────────────────────────────────────────────

import React, { useState } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Aforament from './pages/Aforament';
import Indicadors from './pages/Indicadors';
import Sinistralitat from './pages/Sinistralitat';
import Factors from './pages/Factors';
import GrafanaDashboard from './pages/GrafanaDashboard';
import AccidentProbability from './pages/AccidentProbability';
import Registre from './pages/Registre';
import AmbMetro from './pages/AmbMetro';

// Standalone embed mode — renders just the requested view with no chrome
function EmbedView() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  if (view === 'amb-metro') return <AmbMetro />;
  if (view === 'grafana') return <GrafanaDashboard />;
  if (view === 'probabilitat') return <AccidentProbability />;
  if (view === 'registre') return <Registre />;
  if (view === 'aforament') return <Aforament />;
  return <div style={{ color: '#fff', padding: 20 }}>Unknown embed view: {view}</div>;
}

function AppContent() {
  const [activeSection, setActiveSection] = useState('inici');

  const renderContent = () => {
    switch (activeSection) {
      case 'aforament': return <Aforament />;
      case 'indicadors': return <Indicadors />;
      case 'sinistralitat': return <Sinistralitat />;
      case 'probabilitat': return <AccidentProbability />;
      case 'registre': return <Registre />;
      case 'amb-metro': return <AmbMetro />;
      case 'factors': return <Factors />;
      case 'inici':
      default: return <Dashboard />;
    }
  };

  return (
    <div className="App">
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      <div className="main-content">
        <header className={`app-header ${activeSection === 'amb-metro' ? 'app-header--metro' : ''}`}>
          <h1 className="page-title">
            {activeSection === 'inici' && 'Mapa de tràfic'}
            {activeSection === 'aforament' && 'Aforament'}
            {activeSection === 'indicadors' && 'Indicadors de trànsit'}
            {activeSection === 'sinistralitat' && 'Sinistralitat'}
            {activeSection === 'probabilitat' && "Probabilitat d'accidents"}
            {activeSection === 'registre' && 'Registre'}
            {activeSection === 'amb-metro' && 'AMB-Metro'}
            {activeSection === 'factors' && 'Factors externs'}
          </h1>
        </header>
        <div className="content-area">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

function App() {
  const isEmbed = new URLSearchParams(window.location.search).has('view');
  if (isEmbed) return <EmbedView />;
  return <AppContent />;
}

export default App;
