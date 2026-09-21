import React, { useEffect, useMemo, useState } from 'react';
import { getGoals, getTasks, getActivities, getLifeWheel, getSchedule, setTaskStatus, setActivityLastDone } from '../api/notion';
import { getTodayPlanIds, todayIsoDate } from '../utils/dailyPlan';
import { isOverdue } from '../utils/date';
import { currentMonthKey } from '../utils/lifeWheel';
import { todayDateString, timePart, minutesSinceMidnight, currentMinutesOfDay, formatTimeLabel } from '../utils/schedule';
import { urgencyTier } from '../utils/priority';
import AnimatedCheckbox from './AnimatedCheckbox';
import './HomeScreen.css';

const SCHEDULE_LOOKAHEAD_MINUTES = 5 * 60;

const WEEK_COLLAPSED_KEY = 'life-organiser.week-section-collapsed';
const PRIORITY_LIMIT = 5;
// Areas with no Life Wheel rating yet sort after every rated area — we have
// no evidence they're a problem, so they shouldn't crowd out ones we know
// are low, but they still show up once the higher-signal slots are used.
const UNRATED_SORT_KEY = 11;

function getStoredWeekCollapsed() {
  try {
    return window.localStorage.getItem(WEEK_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function setStoredWeekCollapsed(collapsed) {
  try {
    window.localStorage.setItem(WEEK_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    // localStorage unavailable — the preference just won't persist.
  }
}

// Shared by the Daily Plan list and the This Week list — both render real
// Tasks the same way (checkbox + project tag + overdue flag).
function taskToItem(t) {
  return {
    key: `task-${t.id}`,
    id: t.id,
    kind: 'task',
    label: t.name,
    sublabel: t.projectName
      ? `${t.projectIcon ? `${t.projectIcon} ` : ''}${t.projectName}`
      : null,
    done: t.status === 'Done',
    overdue: isOverdue(t.due),
  };
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

function HomeScreen({ onSeeAllGoals, onOpenSchedule }) {
  const [priorities, setPriorities] = useState([]);
  const [areaScores, setAreaScores] = useState({});
  const [prioritiesState, setPrioritiesState] = useState('loading');

  const [tasks, setTasks] = useState([]);
  const [planActivities, setPlanActivities] = useState([]);
  const [planState, setPlanState] = useState('loading');

  const [weekTasks, setWeekTasks] = useState([]);
  const [weekState, setWeekState] = useState('loading');
  const [weekCollapsed, setWeekCollapsed] = useState(getStoredWeekCollapsed);

  const [scheduleBlocks, setScheduleBlocks] = useState([]);
  const [scheduleState, setScheduleState] = useState('loading');

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      getGoals('This Month', { signal }),
      getLifeWheel(currentMonthKey(), { signal }),
    ])
      .then(([goals, ratings]) => {
        setPriorities(goals);
        const scoreMap = {};
        for (const r of ratings) if (r.areaId) scoreMap[r.areaId] = r.score;
        setAreaScores(scoreMap);
        setPrioritiesState('ready');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to load priorities', err);
        setPrioritiesState('error');
      });
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const planIds = getTodayPlanIds();
    Promise.all([
      getTasks({ when: 'Today', signal }),
      getTasks({ when: 'This Week', signal }),
      getActivities(undefined, { signal }),
    ])
      .then(([taskList, weekTaskList, activityList]) => {
        // Tasks have no "completed on" date, only a Status — so a Done task
        // has no reliable way to tell whether it was finished today or
        // months ago. Drop already-Done tasks at load time so stale
        // completions don't clutter the list; anything ticked off during
        // this session stays visible (it's mutated in place, not re-fetched).
        setTasks(taskList.filter((t) => t.status !== 'Done'));
        setPlanActivities(activityList.filter((a) => planIds.includes(a.id)));
        setPlanState('ready');

        setWeekTasks(weekTaskList.filter((t) => t.status !== 'Done'));
        setWeekState('ready');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to load daily plan', err);
        setPlanState('error');
        setWeekState('error');
      });
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getSchedule(todayDateString(), { signal: controller.signal })
      .then((blocks) => {
        setScheduleBlocks(blocks);
        setScheduleState('ready');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to load schedule preview', err);
        setScheduleState('error');
      });
    return () => {
      controller.abort();
    };
  }, []);

  // "Prioritized" means something real: a goal's own urgency (overdue,
  // has a deadline) outranks which area it's in — area score is only the
  // tie-breaker for goals with no urgency signal of their own. A completed
  // goal is never a "priority."
  const topPriorities = useMemo(() => {
    const eligible = priorities.filter((g) => g.status !== 'Complete');
    const sorted = eligible.sort((a, b) => {
      const tierA = urgencyTier(a.dueDate);
      const tierB = urgencyTier(b.dueDate);
      if (tierA !== tierB) return tierA - tierB;
      if (tierA <= 1) {
        return new Date(a.dueDate) - new Date(b.dueDate);
      }
      const scoreA = areaScores[a.areaId] ?? UNRATED_SORT_KEY;
      const scoreB = areaScores[b.areaId] ?? UNRATED_SORT_KEY;
      return scoreA - scoreB;
    });
    return sorted.slice(0, PRIORITY_LIMIT);
  }, [priorities, areaScores]);

  const planItems = useMemo(() => {
    const today = todayIsoDate();
    return [
      ...tasks.map(taskToItem),
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

  const weekItems = useMemo(() => weekTasks.map(taskToItem), [weekTasks]);

  // Blocks currently happening (started already, hasn't ended) or starting
  // within the next 5 hours — a deliberately short window so Home stays a
  // "right now" glance, not a full day dump (that's what the Schedule tab
  // itself is for).
  const upcomingScheduleBlocks = useMemo(() => {
    const nowMin = currentMinutesOfDay();
    return scheduleBlocks
      .filter((b) => {
        const startMin = minutesSinceMidnight(timePart(b.start));
        const endMin = minutesSinceMidnight(timePart(b.end));
        return endMin > nowMin && startMin <= nowMin + SCHEDULE_LOOKAHEAD_MINUTES;
      })
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [scheduleBlocks]);

  const toggleItem = async (item) => {
    if (item.kind === 'task') {
      const newStatus = item.done ? 'To Do' : 'Done';
      const patchTasks = (setter) =>
        setter((prev) => prev.map((t) => (t.id === item.id ? { ...t, status: newStatus } : t)));
      patchTasks(setTasks);
      patchTasks(setWeekTasks);
      try {
        await setTaskStatus(item.id, newStatus);
      } catch (err) {
        console.error('Failed to update task status', err);
        const revert = (setter) =>
          setter((prev) =>
            prev.map((t) => (t.id === item.id ? { ...t, status: item.done ? 'Done' : 'To Do' } : t))
          );
        revert(setTasks);
        revert(setWeekTasks);
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

  const toggleWeekCollapsed = () => {
    setWeekCollapsed((prev) => {
      const next = !prev;
      setStoredWeekCollapsed(next);
      return next;
    });
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
          <h1 className="today-title">Home</h1>
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
          {prioritiesState === 'ready' && topPriorities.length > 0 && (
            <ul className="priorities-list">
              {topPriorities.map((goal, index) => (
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
          {prioritiesState === 'ready' && priorities.length > PRIORITY_LIMIT && (
            <button type="button" className="priorities-see-all" onClick={onSeeAllGoals}>
              See all {priorities.length} this month's goals →
            </button>
          )}
        </section>

        <div className="today-right-column">
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

        <section className="card card--schedule">
          <div className="section-header">
            <span className="section-icon" aria-hidden="true">📅</span>
            <h2 className="section-title">Today's Schedule</h2>
          </div>
          {scheduleState === 'loading' && <p className="section-status">Loading schedule…</p>}
          {scheduleState === 'error' && (
            <p className="section-status section-status--error">
              Couldn't load the schedule from Notion.
            </p>
          )}
          {scheduleState === 'ready' && upcomingScheduleBlocks.length === 0 && (
            <p className="section-status">Nothing scheduled in the next 5 hours.</p>
          )}
          {scheduleState === 'ready' && upcomingScheduleBlocks.length > 0 && (
            <ul className="schedule-preview-list">
              {upcomingScheduleBlocks.map((block) => (
                <li key={block.id} className="schedule-preview-item">
                  <span className="schedule-preview-time">{formatTimeLabel(timePart(block.start))}</span>
                  <span className="schedule-preview-text">
                    {block.name}
                    {block.areaName && (
                      <span className="schedule-preview-area"> · {block.areaIcon} {block.areaName}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="priorities-see-all" onClick={onOpenSchedule}>
            Open full schedule →
          </button>
        </section>
        </div>

        <section className="card card--week">
          <button
            type="button"
            className="section-header section-header--toggle"
            onClick={toggleWeekCollapsed}
            aria-expanded={!weekCollapsed}
          >
            <span className="section-icon" aria-hidden="true">🗓️</span>
            <h2 className="section-title">This Week</h2>
            <span className="section-tag section-tag--count">{weekItems.length}</span>
            <span
              className={weekCollapsed ? 'subsection-chevron' : 'subsection-chevron subsection-chevron--open'}
              aria-hidden="true"
            >
              ›
            </span>
          </button>
          {!weekCollapsed && (
            <>
              {weekState === 'loading' && <p className="section-status">Loading this week…</p>}
              {weekState === 'error' && (
                <p className="section-status section-status--error">
                  Couldn't load this week's tasks from Notion.
                </p>
              )}
              {weekState === 'ready' && weekItems.length === 0 && (
                <p className="section-status">Nothing lined up for later this week yet.</p>
              )}
              {weekState === 'ready' && weekItems.length > 0 && (
                <ul className="plan-list">
                  {weekItems.map((item) => (
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
            </>
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

export default HomeScreen;
