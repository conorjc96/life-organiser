import React, { useEffect, useMemo, useState } from 'react';
import { getGoals, getAreas } from '../api/notion';
import { formatDueDate, isOverdue } from '../utils/date';
import ScreenHeader from './ScreenHeader';
import AreaFilter from './AreaFilter';
import './GoalsScreen.css';

const TIMEFRAME_ORDER = ['This Week', 'This Month', 'This Quarter', 'This Year', 'Long Term'];
const NO_TIMEFRAME = 'No Timeframe';

const STATUS_CLASS = {
  Complete: 'status-pill--complete',
  'In Progress': 'status-pill--in-progress',
  'Not Started': 'status-pill--not-started',
};

function groupByTimeframe(goals) {
  const groups = new Map();
  for (const goal of goals) {
    const key = goal.timeframe || NO_TIMEFRAME;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(goal);
  }
  const order = [...TIMEFRAME_ORDER, NO_TIMEFRAME];
  return order
    .filter((key) => groups.has(key))
    .map((key) => ({ timeframe: key, goals: groups.get(key) }));
}

function GoalsScreen() {
  const [goals, setGoals] = useState([]);
  const [areas, setAreas] = useState([]);
  const [state, setState] = useState('loading');
  const [selectedAreaId, setSelectedAreaId] = useState('all');

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([getGoals(undefined, { signal }), getAreas({ signal })])
      .then(([goalList, areaList]) => {
        setGoals(goalList);
        setAreas(areaList);
        setState('ready');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to load goals', err);
        setState('error');
      });
    return () => {
      controller.abort();
    };
  }, []);

  const visibleGoals = useMemo(() => {
    if (selectedAreaId === 'all') return goals;
    return goals.filter((g) => g.areaId === selectedAreaId);
  }, [goals, selectedAreaId]);

  const groups = useMemo(() => groupByTimeframe(visibleGoals), [visibleGoals]);

  return (
    <div className="goals-screen">
      <ScreenHeader
        eyebrow="🎯 Goals"
        title="Where you're headed"
        subtitle={`${goals.length || '···'} goals across 8 areas`}
      />

      <AreaFilter areas={areas} selectedAreaId={selectedAreaId} onChange={setSelectedAreaId} />

      <main className="goals-body">
        {state === 'loading' && <p className="section-status">Loading goals…</p>}
        {state === 'error' && (
          <p className="section-status section-status--error">
            Couldn't load goals from Notion.
          </p>
        )}
        {state === 'ready' && visibleGoals.length === 0 && (
          <p className="section-status">No goals in this area yet.</p>
        )}

        {state === 'ready' &&
          groups.map((group) => (
            <section key={group.timeframe} className="timeframe-group">
              <h2 className="timeframe-heading">{group.timeframe}</h2>
              <div className="goals-list">
                {group.goals.map((goal) => {
                  const dueLabel = formatDueDate(goal.dueDate);
                  const overdue = isOverdue(goal.dueDate) && goal.status !== 'Complete';
                  return (
                    <div key={goal.id} className="goal-card">
                      <div className="goal-card-top">
                        <p className="goal-name">{goal.name}</p>
                        <span
                          className={`status-pill ${STATUS_CLASS[goal.status] || 'status-pill--not-started'}`}
                        >
                          {goal.status || 'Not Started'}
                        </span>
                      </div>
                      {goal.target && <p className="goal-target">{goal.target}</p>}
                      <div className="goal-meta">
                        {goal.areaName && (
                          <span className="meta-pill">{goal.areaName}</span>
                        )}
                        {dueLabel && (
                          <span className={overdue ? 'meta-pill meta-pill--stale' : 'meta-pill'}>
                            Due {dueLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
      </main>
    </div>
  );
}

export default GoalsScreen;
