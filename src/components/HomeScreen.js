import React, { useEffect, useMemo, useState } from 'react';
import { getGoals, getTasks, getActivities, getAreas, setTaskStatus, setActivityLastDone } from '../api/notion';
import { getTodayPlanIds, todayIsoDate } from '../utils/dailyPlan';
import { isOverdue, daysSince, formatLastDone } from '../utils/date';
import AnimatedCheckbox from './AnimatedCheckbox';
import './TodayScreen.css';

const FOCUS_AREA_COUNT = 3;

// Focus Areas ≠ Priorities: Priorities are this month's Goals (what you're
// working toward). Focus Areas is a balance signal derived from Activities'
// Last Done — which of the 8 life areas has gone quietest lately, independent
// of any goal.
function computeFocusAreas(activities, areas) {
  const latestByArea = new Map();
  for (const activity of activities) {
    if (!activity.areaId || !activity.lastDone) continue;
    const current = latestByArea.get(activity.areaId);
    if (!current || activity.lastDone > current) {
      latestByArea.set(activity.areaId, activity.lastDone);
    }
  }
  return areas
    .map((area) => {
      const lastDone = latestByArea.get(area.id) || null;
      return { ...area, lastDone, neglectDays: daysSince(lastDone) };
    })
    .sort((a, b) => b.neglectDays - a.neglectDays)
    .slice(0, FOCUS_AREA_COUNT);
}

const MORNING_BRIEF =
  "Looks like a full one today — take it one step at a time, and save something for yourself before the day ends.";

function getGreeting(hour) {
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Winding down';
}

function TodayScreen() {
  const [priorities, setPriorities] = useState([]);
  const [prioritiesState, setPrioritiesState] = useState('loading');

  const [tasks, setTasks] = useState([]);
  const [planActivities, setPlanActivities] = useState([]);
  const [planState, setPlanState] = useState('loading');

  const [focusAreas, setFocusAreas] = useState([]);
  const [focusState, setFocusState] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    getGoals('This Month')
      .then((goals) => {
        if (cancelled) return;
        setPriorities(goals);
        setPrioritiesState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load priorities', err);
        setPrioritiesState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const planIds = getTodayPlanIds();
    Promise.all([getTasks({ when: 'Today' }), getActivities(), getAreas()])
      .then(([taskList, activityList, areaList]) => {
        if (cancelled) return;
        // Tasks have no "completed on" date, only a Status — so a Done task
        // has no reliable way to tell whether it was finished today or
        // months ago. Drop already-Done tasks at load time so stale
        // completions don't clutter the list; anything ticked off during
        // this session stays visible (it's mutated in place, not re-fetched).
        setTasks(taskList.filter((t) => t.status !== 'Done'));
        setPlanActivities(activityList.filter((a) => planIds.includes(a.id)));
        setPlanState('ready');

        setFocusAreas(computeFocusAreas(activityList, areaList));
        setFocusState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load daily plan', err);
        setPlanState('error');
        setFocusState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const planItems = useMemo(() => {
    const today = todayIsoDate();
    return [
      ...tasks.map((t) => ({
        key: `task-${t.id}`,
        id: t.id,
        kind: 'task',
        label: t.name,
        sublabel: t.projectName
          ? `${t.projectIcon ? `${t.projectIcon} ` : ''}${t.projectName}`
          : null,
        done: t.status === 'Done',
        overdue: isOverdue(t.due),
      })),
      ...planActivities.map((a) => ({
        key: `activity-${a.id}`,
        id: a.id,
        kind: 'activity',
        label: a.name,
        sublabel: a.areaName,
        done: a.lastDone === today,
      })),
    ];
  }, [tasks, planActivities]);

  const toggleItem = async (item) => {
    if (item.kind === 'task') {
      const newStatus = item.done ? 'To Do' : 'Done';
      setTasks((prev) =>
        prev.map((t) => (t.id === item.id ? { ...t, status: newStatus } : t))
      );
      try {
        await setTaskStatus(item.id, newStatus);
      } catch (err) {
        console.error('Failed to update task status', err);
        setTasks((prev) =>
          prev.map((t) => (t.id === item.id ? { ...t, status: item.done ? 'Done' : 'To Do' } : t))
        );
      }
    } else {
      const newLastDone = item.done ? null : todayIsoDate();
      setPlanActivities((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, lastDone: newLastDone } : a))
      );
      try {
        await setActivityLastDone(item.id, newLastDone);
      } catch (err) {
        console.error('Failed to update activity last done', err);
        setPlanActivities((prev) =>
          prev.map((a) =>
            a.id === item.id ? { ...a, lastDone: item.done ? todayIsoDate() : null } : a
          )
        );
      }
    }
  };

  const now = new Date();
  const today = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const greeting = getGreeting(now.getHours());
  const doneCount = planItems.filter((item) => item.done).length;

  return (
    <div className="today-screen">
      <header className="today-header">
        <div className="today-header-inner">
          <p className="today-greeting">{greeting}</p>
          <h1 className="today-title">Today</h1>
          <p className="today-date">{today}</p>
        </div>
      </header>

      <main className="today-body">
        <section className="card card--priorities">
          <div className="section-header">
            <span className="section-icon" aria-hidden="true">🎯</span>
            <h2 className="section-title">Priorities</h2>
            <span className="section-tag">This Month</span>
          </div>
          {prioritiesState === 'loading' && (
            <p className="section-status">Loading priorities…</p>
          )}
          {prioritiesState === 'error' && (
            <p className="section-status section-status--error">
              Couldn't load priorities from Notion.
            </p>
          )}
          {prioritiesState === 'ready' && priorities.length === 0 && (
            <p className="section-status">No goals set for this month yet.</p>
          )}
          {prioritiesState === 'ready' && priorities.length > 0 && (
            <ul className="priorities-list">
              {priorities.map((goal, index) => (
                <li key={goal.id} className="priority-item">
                  <span className="priority-number">{index + 1}</span>
                  <span className="priority-text">
                    {goal.name}
                    {goal.areaName && (
                      <span className="priority-area"> · {goal.areaName}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card card--focus">
          <div className="section-header">
            <span className="section-icon" aria-hidden="true">🧭</span>
            <h2 className="section-title">Focus Areas</h2>
          </div>
          {focusState === 'loading' && (
            <p className="section-status">Loading focus areas…</p>
          )}
          {focusState === 'error' && (
            <p className="section-status section-status--error">
              Couldn't load focus areas from Notion.
            </p>
          )}
          {focusState === 'ready' && (
            <ul className="focus-list">
              {focusAreas.map((area) => (
                <li key={area.id} className="focus-item">
                  <span className="focus-icon" aria-hidden="true">{area.icon}</span>
                  <span className="focus-name">{area.name}</span>
                  <span className="focus-last">{formatLastDone(area.lastDone)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card card--plan">
          <div className="section-header">
            <span className="section-icon" aria-hidden="true">✅</span>
            <h2 className="section-title">Daily Plan</h2>
            <span className="section-tag section-tag--count">
              {doneCount}/{planItems.length}
            </span>
          </div>
          {planState === 'loading' && <p className="section-status">Loading your plan…</p>}
          {planState === 'error' && (
            <p className="section-status section-status--error">
              Couldn't load today's plan from Notion.
            </p>
          )}
          {planState === 'ready' && planItems.length === 0 && (
            <p className="section-status">
              Nothing planned yet — add tasks or activities to get started.
            </p>
          )}
          {planState === 'ready' && planItems.length > 0 && (
            <ul className="plan-list">
              {planItems.map((item) => (
                <li key={item.key} className="plan-item">
                  <AnimatedCheckbox
                    checked={item.done}
                    onChange={() => toggleItem(item)}
                    label={item.label}
                    sublabel={item.sublabel}
                    overdue={item.overdue}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card card--brief">
          <div className="section-header">
            <span className="section-icon" aria-hidden="true">☀️</span>
            <h2 className="section-title">Morning Brief</h2>
          </div>
          <p className="brief-text">{MORNING_BRIEF}</p>
        </section>
      </main>
    </div>
  );
}

export default TodayScreen;
