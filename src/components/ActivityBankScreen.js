import React, { useEffect, useMemo, useState } from 'react';
import { getActivities, getAreas } from '../api/notion';
import { formatLastDone, daysSince } from '../utils/date';
import { getTodayPlanIds, addToTodayPlan, removeFromTodayPlan, todayIsoDate } from '../utils/dailyPlan';
import ScreenHeader from './ScreenHeader';
import AreaFilter from './AreaFilter';
import './ActivityBankScreen.css';

const TYPE_ICON = { Solo: '🧍', Social: '👥', Paired: '🤝' };
const NEGLECTED_THRESHOLD_DAYS = 30;

function ActivityBankScreen() {
  const [activities, setActivities] = useState([]);
  const [areas, setAreas] = useState([]);
  const [state, setState] = useState('loading');
  const [selectedAreaId, setSelectedAreaId] = useState('all');
  const [addedIds, setAddedIds] = useState(() => new Set(getTodayPlanIds()));

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([getActivities(undefined, { signal }), getAreas({ signal })])
      .then(([activityList, areaList]) => {
        setActivities(activityList);
        setAreas(areaList);
        setState('ready');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to load activity bank', err);
        setState('error');
      });
    return () => {
      controller.abort();
    };
  }, []);

  const visibleActivities = useMemo(() => {
    if (selectedAreaId === 'all') return activities;
    return activities.filter((a) => a.areaId === selectedAreaId);
  }, [activities, selectedAreaId]);

  const toggleAdded = (id) => {
    setAddedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        removeFromTodayPlan(id);
      } else {
        next.add(id);
        addToTodayPlan(id);
      }
      return next;
    });
  };

  return (
    <div className="activity-screen">
      <ScreenHeader
        eyebrow="📚 Activity Bank"
        title="Choose your next move"
        subtitle={`${activities.length || '···'} activities across 8 areas`}
      />

      <AreaFilter areas={areas} selectedAreaId={selectedAreaId} onChange={setSelectedAreaId} />

      <main className="activity-body">
        {state === 'loading' && <p className="section-status">Loading activities…</p>}
        {state === 'error' && (
          <p className="section-status section-status--error">
            Couldn't load activities from Notion.
          </p>
        )}
        {state === 'ready' && visibleActivities.length === 0 && (
          <p className="section-status">No activities in this area yet.</p>
        )}

        {state === 'ready' &&
          visibleActivities.map((activity) => {
            const isAdded = addedIds.has(activity.id);
            const doneToday = activity.lastDone === todayIsoDate();
            const neglected = daysSince(activity.lastDone) >= NEGLECTED_THRESHOLD_DAYS;
            return (
              <div key={activity.id} className="activity-card">
                <div className="activity-card-main">
                  <p className="activity-name">{activity.name}</p>
                  <div className="activity-meta">
                    <span className="meta-pill">
                      {TYPE_ICON[activity.type] || ''} {activity.type}
                    </span>
                    <span className="meta-pill">{activity.duration}</span>
                    <span className={neglected ? 'meta-pill meta-pill--stale' : 'meta-pill'}>
                      {formatLastDone(activity.lastDone)}
                    </span>
                  </div>
                  {activity.areaName && (
                    <p className="activity-area">{activity.areaName}</p>
                  )}
                </div>
                {doneToday ? (
                  <span className="add-button add-button--done">✓ Done today</span>
                ) : (
                  <button
                    type="button"
                    className={isAdded ? 'add-button add-button--added' : 'add-button'}
                    onClick={() => toggleAdded(activity.id)}
                  >
                    {isAdded ? '✓ Added' : '+ Add'}
                  </button>
                )}
              </div>
            );
          })}
      </main>
    </div>
  );
}

export default ActivityBankScreen;
