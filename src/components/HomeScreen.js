import React, { useEffect, useMemo, useState } from 'react';
import {
  getGoals,
  getTasks,
  getActivities,
  getLifeWheel,
  getSchedule,
  setTaskStatus,
  setActivityLastDone,
  createTask,
  setTaskWhen,
} from '../api/notion';
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
// Tasks the same way (checkbox + project tag + overdue flag). Keeps a
// reference to the raw task so drag-and-drop can read/patch its `when`.
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
    task: t,
  };
}

const DRAG_THRESHOLD_PX = 6; // below this, a pointerdown+up is a tap, not a drag

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

  const [todayDraft, setTodayDraft] = useState('');
  const [weekDraft, setWeekDraft] = useState('');
  const [creatingToday, setCreatingToday] = useState(false);
  const [creatingWeek, setCreatingWeek] = useState(false);

  // Every task, regardless of bucket — fetched once alongside Today/This
  // Week so the add-task inputs can search across all of Notion for a
  // possible duplicate as you type, not just what's already on screen.
  const [allTasks, setAllTasks] = useState([]);

  // { id, pointerId, sourceList: 'today' | 'week', task, moved }
  const [dragTask, setDragTask] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // 'today' | 'week' | null

  const [backlogOpen, setBacklogOpen] = useState(false);
  const [backlogTasks, setBacklogTasks] = useState([]);
  const [backlogState, setBacklogState] = useState('idle'); // idle | loading | ready | error
  const [backlogDraft, setBacklogDraft] = useState('');
  const [creatingBacklog, setCreatingBacklog] = useState(false);

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
      getTasks({ signal }), // every task — powers the add-task duplicate search
    ])
      .then(([taskList, weekTaskList, activityList, everyTask]) => {
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

        setAllTasks(everyTask);
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

  const MATCH_MIN_CHARS = 2;
  const MATCH_LIMIT = 6;

  // Surfaces existing Notion tasks that look like what you're about to
  // type, so adding a task doesn't quietly create a duplicate of one
  // that's already sitting in another bucket. Excludes tasks already in
  // the target bucket (they're already visible in the list above) and
  // anything Done (resurfacing a finished task isn't useful here).
  const todayMatches = useMemo(() => {
    const q = todayDraft.trim().toLowerCase();
    if (q.length < MATCH_MIN_CHARS) return [];
    return allTasks
      .filter((t) => t.status !== 'Done' && t.when !== 'Today' && t.name.toLowerCase().includes(q))
      .slice(0, MATCH_LIMIT);
  }, [todayDraft, allTasks]);

  const weekMatches = useMemo(() => {
    const q = weekDraft.trim().toLowerCase();
    if (q.length < MATCH_MIN_CHARS) return [];
    return allTasks
      .filter((t) => t.status !== 'Done' && t.when !== 'This Week' && t.name.toLowerCase().includes(q))
      .slice(0, MATCH_LIMIT);
  }, [weekDraft, allTasks]);

  const matchTag = (t) => (t.projectName ? `${t.when} · ${t.projectName}` : t.when);

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
      patchTasks(setAllTasks);
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
        revert(setAllTasks);
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

  const submitTodayTask = async () => {
    const name = todayDraft.trim();
    if (!name || creatingToday) return;
    setCreatingToday(true);
    try {
      const task = await createTask({ name, when: 'Today' });
      setTasks((prev) => [...prev, task]);
      setAllTasks((prev) => [...prev, task]);
      setTodayDraft('');
    } catch (err) {
      console.error('Failed to create task', err);
    } finally {
      setCreatingToday(false);
    }
  };

  const submitWeekTask = async () => {
    const name = weekDraft.trim();
    if (!name || creatingWeek) return;
    setCreatingWeek(true);
    try {
      const task = await createTask({ name, when: 'This Week' });
      setWeekTasks((prev) => [...prev, task]);
      setAllTasks((prev) => [...prev, task]);
      setWeekDraft('');
    } catch (err) {
      console.error('Failed to create task', err);
    } finally {
      setCreatingWeek(false);
    }
  };

  // Picking an existing task from the search dropdown moves it into the
  // bucket instead of creating a new one — the whole point is avoiding a
  // duplicate of a task that's already somewhere in Notion (e.g. Backlog).
  const selectExistingTask = async (task, targetList) => {
    await moveTaskBucket(task, targetList);
    if (targetList === 'today') setTodayDraft('');
    else setWeekDraft('');
  };

  // Moves a task between the Today and This Week buckets (used by the
  // drag-and-drop handlers below, backlog promotion, and picking a search
  // match). Optimistically updates whichever local arrays are involved,
  // then persists. Also clears it from Backlog/allTasks caches so it
  // doesn't linger there under its old bucket.
  const moveTaskBucket = async (task, targetList) => {
    const newWhen = targetList === 'today' ? 'Today' : 'This Week';
    if (task.when === newWhen) return;
    const prevWhen = task.when;

    if (targetList === 'today') {
      setWeekTasks((prev) => prev.filter((t) => t.id !== task.id));
      setTasks((prev) => [...prev, { ...task, when: newWhen }]);
    } else {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      setWeekTasks((prev) => [...prev, { ...task, when: newWhen }]);
    }
    setBacklogTasks((prev) => prev.filter((t) => t.id !== task.id));
    setAllTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, when: newWhen } : t)));

    try {
      await setTaskWhen(task.id, newWhen);
    } catch (err) {
      console.error('Failed to move task', err);
      if (targetList === 'today') {
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
        setWeekTasks((prev) => [...prev, { ...task, when: prevWhen }]);
      } else {
        setWeekTasks((prev) => prev.filter((t) => t.id !== task.id));
        setTasks((prev) => [...prev, { ...task, when: prevWhen }]);
      }
      setAllTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, when: prevWhen } : t)));
    }
  };

  // Drag-and-drop between the Daily Plan and This Week lists — Pointer
  // Events rather than HTML5 drag-and-drop, since HTML5 DnD has unreliable
  // touch support on mobile (this is a PWA on Android). A small handle on
  // each task row starts the drag; the drop target is whatever list
  // container the pointer is over on release, found via elementFromPoint
  // rather than tracked drag-over state, since the two lists are separate
  // DOM subtrees (not one shared timeline like the Schedule screen).
  const handleDragHandlePointerDown = (e, task, sourceList) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragTask({
      id: task.id,
      pointerId: e.pointerId,
      sourceList,
      task,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    });
    setDropTarget(null);
  };

  const handleDragHandlePointerMove = (e) => {
    if (!dragTask || e.pointerId !== dragTask.pointerId) return;
    e.preventDefault();
    const dist = Math.hypot(e.clientX - dragTask.startX, e.clientY - dragTask.startY);
    const moved = dragTask.moved || dist > DRAG_THRESHOLD_PX;
    setDragTask((prev) => (prev ? { ...prev, moved } : prev));
    if (!moved) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const listEl = el && el.closest('[data-dnd-list]');
    const target = listEl ? listEl.dataset.dndList : null;
    setDropTarget(target && target !== dragTask.sourceList ? target : null);
  };

  const handleDragHandlePointerUp = async (e) => {
    if (!dragTask || e.pointerId !== dragTask.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // already released — harmless
    }
    const { task, moved } = dragTask;
    const target = dropTarget;
    setDragTask(null);
    setDropTarget(null);
    if (!moved || !target) return;
    await moveTaskBucket(task, target);
  };

  const openBacklog = async () => {
    setBacklogOpen(true);
    setBacklogState('loading');
    try {
      const list = await getTasks({ when: 'Backlog' });
      // Project steps belong to their project's own task list (visible on
      // the Projects screen) — the backlog is for standalone tasks with no
      // project home yet, not a second copy of every project's roadmap.
      setBacklogTasks(
        list.filter((t) => t.status !== 'Done' && t.projectIds.length === 0)
      );
      setBacklogState('ready');
    } catch (err) {
      console.error('Failed to load backlog', err);
      setBacklogState('error');
    }
  };

  const closeBacklog = () => {
    setBacklogOpen(false);
  };

  const submitBacklogTask = async () => {
    const name = backlogDraft.trim();
    if (!name || creatingBacklog) return;
    setCreatingBacklog(true);
    try {
      const task = await createTask({ name, when: 'Backlog' });
      setBacklogTasks((prev) => [...prev, task]);
      setAllTasks((prev) => [...prev, task]);
      setBacklogDraft('');
    } catch (err) {
      console.error('Failed to create task', err);
    } finally {
      setCreatingBacklog(false);
    }
  };

  const toggleBacklogTask = async (task) => {
    const newStatus = task.status === 'Done' ? 'To Do' : 'Done';
    setBacklogTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    setAllTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    try {
      await setTaskStatus(task.id, newStatus);
    } catch (err) {
      console.error('Failed to update backlog task status', err);
      setBacklogTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
      setAllTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
    }
  };

  const promoteBacklogTask = async (task, targetList) => {
    const newWhen = targetList === 'today' ? 'Today' : 'This Week';
    setBacklogTasks((prev) => prev.filter((t) => t.id !== task.id));
    if (targetList === 'today') {
      setTasks((prev) => [...prev, { ...task, when: newWhen }]);
    } else {
      setWeekTasks((prev) => [...prev, { ...task, when: newWhen }]);
    }
    setAllTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, when: newWhen } : t)));
    try {
      await setTaskWhen(task.id, newWhen);
    } catch (err) {
      console.error('Failed to promote backlog task', err);
      setBacklogTasks((prev) => [...prev, task]);
      if (targetList === 'today') {
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
      } else {
        setWeekTasks((prev) => prev.filter((t) => t.id !== task.id));
      }
      setAllTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, when: task.when } : t)));
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
        <section
          className={
            dropTarget === 'today' ? 'card card--plan card--drop-target' : 'card card--plan'
          }
          data-dnd-list="today"
        >
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
                  {item.kind === 'task' && (
                    <button
                      type="button"
                      className="drag-handle"
                      aria-label="Drag to move"
                      onPointerDown={(e) => handleDragHandlePointerDown(e, item.task, 'today')}
                      onPointerMove={handleDragHandlePointerMove}
                      onPointerUp={handleDragHandlePointerUp}
                    >
                      ⠿
                    </button>
                  )}
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
          <div className="add-task-row">
            <div className="add-task-input-wrap">
              <input
                type="text"
                className="add-task-input"
                placeholder="Add a task for today…"
                value={todayDraft}
                onChange={(e) => setTodayDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitTodayTask();
                }}
              />
              {todayMatches.length > 0 && (
                <ul className="task-search-dropdown">
                  {todayMatches.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => selectExistingTask(t, 'today')}
                      >
                        <span className="task-search-name">{t.name}</span>
                        <span className="task-search-tag">{matchTag(t)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              className="add-task-button"
              disabled={!todayDraft.trim() || creatingToday}
              onClick={submitTodayTask}
            >
              Add
            </button>
          </div>
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

        <section
          className={
            dropTarget === 'week' ? 'card card--week card--drop-target' : 'card card--week'
          }
          data-dnd-list="week"
        >
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
                      <button
                        type="button"
                        className="drag-handle"
                        aria-label="Drag to move"
                        onPointerDown={(e) => handleDragHandlePointerDown(e, item.task, 'week')}
                        onPointerMove={handleDragHandlePointerMove}
                        onPointerUp={handleDragHandlePointerUp}
                      >
                        ⠿
                      </button>
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
              <div className="add-task-row">
                <div className="add-task-input-wrap">
                  <input
                    type="text"
                    className="add-task-input"
                    placeholder="Add a task for this week…"
                    value={weekDraft}
                    onChange={(e) => setWeekDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitWeekTask();
                    }}
                  />
                  {weekMatches.length > 0 && (
                    <ul className="task-search-dropdown">
                      {weekMatches.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => selectExistingTask(t, 'week')}
                          >
                            <span className="task-search-name">{t.name}</span>
                            <span className="task-search-tag">{matchTag(t)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  className="add-task-button"
                  disabled={!weekDraft.trim() || creatingWeek}
                  onClick={submitWeekTask}
                >
                  Add
                </button>
              </div>
              <button type="button" className="priorities-see-all" onClick={openBacklog}>
                View backlog →
              </button>
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

      {backlogOpen && (
        <div className="home-modal-overlay" onClick={closeBacklog}>
          <div className="home-backlog-modal card" onClick={(e) => e.stopPropagation()}>
            <div className="section-header">
              <span className="section-icon" aria-hidden="true">📥</span>
              <h2 className="section-title">Backlog</h2>
            </div>
            {backlogState === 'loading' && <p className="section-status">Loading backlog…</p>}
            {backlogState === 'error' && (
              <p className="section-status section-status--error">
                Couldn't load the backlog from Notion.
              </p>
            )}
            {backlogState === 'ready' && backlogTasks.length === 0 && (
              <p className="section-status">Nothing in the backlog.</p>
            )}
            {backlogState === 'ready' && backlogTasks.length > 0 && (
              <ul className="backlog-list">
                {backlogTasks.map((task) => (
                  <li key={task.id} className="backlog-item">
                    <AnimatedCheckbox
                      checked={task.status === 'Done'}
                      onChange={() => toggleBacklogTask(task)}
                      label={task.name}
                      sublabel={
                        task.projectName
                          ? `${task.projectIcon ? `${task.projectIcon} ` : ''}${task.projectName}`
                          : null
                      }
                      overdue={isOverdue(task.due)}
                    />
                    <div className="when-toggle-group">
                      <button
                        type="button"
                        className="when-toggle when-toggle--week"
                        onClick={() => promoteBacklogTask(task, 'week')}
                      >
                        Week
                      </button>
                      <button
                        type="button"
                        className="when-toggle"
                        onClick={() => promoteBacklogTask(task, 'today')}
                      >
                        Today
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="add-task-row">
              <input
                type="text"
                className="add-task-input"
                placeholder="Add a task to the backlog…"
                value={backlogDraft}
                onChange={(e) => setBacklogDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitBacklogTask();
                }}
              />
              <button
                type="button"
                className="add-task-button"
                disabled={!backlogDraft.trim() || creatingBacklog}
                onClick={submitBacklogTask}
              >
                Add
              </button>
            </div>
            <button type="button" className="home-backlog-close" onClick={closeBacklog}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default HomeScreen;
