// L.I.F.E Organiser — Life Investment & Focus Engine

import React, { useState } from 'react';
import HomeScreen from './components/HomeScreen';
import ActivityBankScreen from './components/ActivityBankScreen';
import ProjectsScreen from './components/ProjectsScreen';
import GoalsScreen from './components/GoalsScreen';
import StatsScreen from './components/StatsScreen';
import LifeWheelScreen from './components/LifeWheelScreen';
import ScheduleScreen from './components/ScheduleScreen';
import BottomNav from './components/BottomNav';
import './App.css';

function App() {
  const [screen, setScreen] = useState('home');
  const isSubPage = screen === 'life-wheel';

  return (
    <div className="App">
      {screen === 'home' && <HomeScreen onOpenSchedule={() => setScreen('schedule')} />}
      {screen === 'activities' && <ActivityBankScreen />}
      {screen === 'projects' && <ProjectsScreen />}
      {screen === 'goals' && <GoalsScreen />}
      {screen === 'stats' && <StatsScreen onOpenLifeWheel={() => setScreen('life-wheel')} />}
      {screen === 'life-wheel' && <LifeWheelScreen onBack={() => setScreen('stats')} />}
      {screen === 'schedule' && <ScheduleScreen />}
      {!isSubPage && <BottomNav active={screen} onChange={setScreen} />}
    </div>
  );
}

export default App;
