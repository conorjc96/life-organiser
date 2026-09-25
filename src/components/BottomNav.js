import React from 'react';
import './BottomNav.css';

const TABS = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'activities', label: 'Activities', icon: '📚' },
  { id: 'projects', label: 'Projects', icon: '🚀' },
  { id: 'goals', label: 'Goals', icon: '🎯' },
  { id: 'stats', label: 'Stats', icon: '📊' },
  { id: 'schedule', label: 'Schedule', icon: '📅' },
  { id: 'music', label: 'Music', icon: '🎵' },
];

function BottomNav({ active, onChange }) {
  return (
    <nav className="bottom-nav">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={active === tab.id ? 'nav-tab nav-tab--active' : 'nav-tab'}
          onClick={() => onChange(tab.id)}
        >
          <span className="nav-icon" aria-hidden="true">{tab.icon}</span>
          <span className="nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default BottomNav;
