import React, { useEffect, useMemo, useState } from 'react';
import {
  getTasks,
  getActivities,
  getSchedule,
  getHabits,
  getProjects,
  getAreas,
  setTaskStatus,
  setActivityLastDone,
  createTask,
  setTaskWhen,
  setHabitDay,
} from '../api/notion';
import { getTodayPlanIds, todayIsoDate } from '../utils/dailyPlan';
import { isOverdue } from '../utils/date';
import { todayDateString, timePart, minutesSinceMidnight, currentMinutesOfDay, formatTimeLabel } from '../utils/schedule';
import AnimatedCheckbox from './AnimatedCheckbox';
import TaskDetailModal from './TaskDetailModal';
import './HomeScreen.css';

const SCHEDULE_LOOKAHEAD_MINUTES = 5 * 60;

const WEEK_COLLAPSED_KEY = 'life-organiser.week-section-collapsed';

// Habits Tracker is a weekly grid (one row per habit, a standing checkbox
// per weekday reused across weeks) rather than a per-date log — "today"
// just means reading/writing whichever of these matches the current day.
const HABIT_DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function todayHabitDay() {
  return HABIT_DAY_KEYS[new Date().getDay()];
}

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

function HomeScreen({ onOpenSchedule }) {
  const [habits, setHabits] = useState([]);
  const [habitsState, setHabitsState] = useState('loading');

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

  // The task detail dialog — opened from any task row (not activities).
  // Projects are fetched lazily on first open, same lazy-fetch reasoning
  // as Backlog: most visits never open a task's details.
  const [detailTask, setDetailTask] = useState(null);
  const [detailProjects, setDetailProjects] = useState([]);
  const [detailAreas, setDetailAreas] = useState([]);
  const [detailLookupsLoaded, setDetailLookupsLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getHabits({ signal: controller.signal })
      .then((list) => {
        setHabits(list.filter((h) => h.active));
        setHabitsState('ready');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to load habits', err);
        setHabitsState('error');
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

  const todayKey = todayHabitDay();
  const habitsDoneCount = habits.filter((h) => h.days[todayKey]).length;

  const toggleHabit = async (habit) => {
    const newValue = !habit.days[todayKey];
    setHabits((prev) =>
      prev.map((h) => (h.id === habit.id ? { ...h, days: { ...h.days, [todayKey]: newValue } } : h))
    );
    try {
      await setHabitDay(habit.id, todayKey, newValue);
    } catch (err) {
      console.error('Failed to update habit', err);
      setHabits((prev) =>
        prev.map((h) => (h.id === habit.id ? { ...h, days: { ...h.days, [todayKey]: !newValue } } : h))
      );
    }
  };

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

  const WHEN_BY_LIST = { today: 'Today', week: 'This Week', backlog: 'Backlog' };

  // Places `task` into whichever of the three tracked local arrays matches
  // `when` — Backlog is only kept in sync if its modal is currently open,
  // since otherwise `backlogTasks` is just stale state nobody's looking at
  // (openBacklog re-fetches fresh every time it opens).
  const putTaskIn = (task, when) => {
    if (when === 'Today') setTasks((prev) => [...prev, { ...task, when }]);
    else if (when === 'This Week') setWeekTasks((prev) => [...prev, { ...task, when }]);
    else if (backlogOpen) setBacklogTasks((prev) => [...prev, { ...task, when }]);
  };

  // Moves a task between Today, This Week, and Backlog — used by the
  // drag-and-drop handlers below (now a three-way graph: dragging onto the
  // "View backlog" link moves a task there too, not just between Today and
  // Week), backlog promotion, and picking a search match. Optimistically
  // removes the task from every tracked array first (it only ever lives in
  // one), places it in the destination, then persists.
  const moveTaskBucket = async (task, targetList) => {
    const newWhen = WHEN_BY_LIST[targetList];
    if (task.when === newWhen) return;
    const prevWhen = task.when;

    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    setWeekTasks((prev) => prev.filter((t) => t.id !== task.id));
    setBacklogTasks((prev) => prev.filter((t) => t.id !== task.id));
    putTaskIn(task, newWhen);
    setAllTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, when: newWhen } : t)));

    try {
      await setTaskWhen(task.id, newWhen);
    } catch (err) {
      console.error('Failed to move task', err);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      setWeekTasks((prev) => prev.filter((t) => t.id !== task.id));
      setBacklogTasks((prev) => prev.filter((t) => t.id !== task.id));
      putTaskIn(task, prevWhen);
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

  // Now just the backlog-modal-specific entry point into the same generic
  // move — kept as its own name since it's called from very different UI
  // (a button in the modal, not a drag).
  const promoteBacklogTask = (task, targetList) => moveTaskBucket(task, targetList);

  const openTaskDetail = (task) => {
    setDetailTask(task);
    if (!detailLookupsLoaded) {
      Promise.all([getProjects(), getAreas()])
        .then(([projectList, areaList]) => {
          setDetailProjects(projectList);
          setDetailAreas(areaList);
          setDetailLookupsLoaded(true);
        })
        .catch((err) => console.error('Failed to load projects/areas for task detail', err));
    }
  };

  const closeTaskDetail = () => setDetailTask(null);

  // The dialog can change *any* field, including `when` (moving buckets)
  // and `status` — rather than patching each tracked array in place, pull
  // the task out of all three and re-insert it wherever the fresh
  // `updated.when` says it belongs now, same idea as moveTaskBucket.
  const handleTaskSaved = (updated) => {
    setTasks((prev) => {
      const filtered = prev.filter((t) => t.id !== updated.id);
      return updated.when === 'Today' ? [...filtered, updated] : filtered;
    });
    setWeekTasks((prev) => {
      const filtered = prev.filter((t) => t.id !== updated.id);
      return updated.when === 'This Week' ? [...filtered, updated] : filtered;
    });
    setBacklogTasks((prev) => {
      const filtered = prev.filter((t) => t.id !== updated.id);
      return updated.when === 'Backlog' ? [...filtered, updated] : filtered;
    });
    setAllTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    closeTaskDetail();
  };

  const handleTaskDeleted = (taskId) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setWeekTasks((prev) => prev.filter((t) => t.id !== taskId));
    setBacklogTasks((prev) => prev.filter((t) => t.id !== taskId));
    setAllTasks((prev) => prev.filter((t) => t.id !== taskId));
    closeTaskDetail();
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
        <section className="card card--habits">
          <div className="section-header">
            <span className="section-icon" aria-hidden="true">🔄</span>
            <h2 className="section-title">Habits</h2>
            <span className="section-tag section-tag--count">
              {habitsDoneCount}/{habits.length}
            </span>
          </div>
          {habitsState === 'loading' && <p className="section-status">Loading habits…</p>}
          {habitsState === 'error' && (
            <p className="section-status section-status--error">
              Couldn't load habits from Notion.
            </p>
          )}
          {habitsState === 'ready' && habits.length === 0 && (
            <p className="section-status">No active habits set up yet.</p>
          )}
          {habitsState === 'ready' && habits.length > 0 && (
            <ul className="plan-list">
              {habits.map((habit) => (
                <li key={habit.id} className="plan-item">
                  <AnimatedCheckbox
                    checked={habit.days[todayKey]}
                    onChange={() => toggleHabit(habit)}
                    label={habit.name}
                    sublabel={
                      habit.frequency === 'Weekly' && habit.weeklyTarget
                        ? `${Object.values(habit.days).filter(Boolean).length}/${habit.weeklyTarget} this week`
                        : habit.category
                    }
                  />
                </li>
              ))}
            </ul>
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
                    onLabelClick={item.kind === 'task' ? () => openTaskDetail(item.task) : undefined}
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
                        onLabelClick={() => openTaskDetail(item.task)}
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
              <button
                type="button"
                className={
                  dropTarget === 'backlog' ? 'backlog-link backlog-link--drop-target' : 'backlog-link'
                }
                data-dnd-list="backlog"
                onClick={openBacklog}
              >
                📥 View backlog →
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
                      onLabelClick={() => openTaskDetail(task)}
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

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          projects={detailProjects}
          areas={detailAreas}
          onClose={closeTaskDetail}
          onSaved={handleTaskSaved}
          onDeleted={handleTaskDeleted}
        />
      )}
    </div>
  );
}

export default HomeScreen;
