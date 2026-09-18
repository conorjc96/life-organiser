// L.I.F.E Organiser — Life Investment & Focus Engine

import React, { useState } from 'react';
import TodayScreen from './components/TodayScreen';
import ActivityBankScreen from './components/ActivityBankScreen';
import ProjectsScreen from './components/ProjectsScreen';
import GoalsScreen from './components/GoalsScreen';
import ComingSoonScreen from './components/ComingSoonScreen';
import BottomNav from './components/BottomNav';
import './App.css';

function App() {
  const [screen, setScreen] = useState('today');

  return (
    <div className="App">
      {screen === 'today' && <TodayScreen />}
      {screen === 'activities' && <ActivityBankScreen />}
      {screen === 'projects' && <ProjectsScreen />}
      {screen === 'goals' && <GoalsScreen />}
      {screen === 'weekly' && <ComingSoonScreen icon="🗓️" title="Weekly View" />}
      <BottomNav active={screen} onChange={setScreen} />
    </div>
  );
}

export default App;
