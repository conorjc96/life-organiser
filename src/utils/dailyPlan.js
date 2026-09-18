// "Today's plan" (which activities you've chosen to do today, before
// they're actually done) is transient working state, not a durable
// record — so it lives in localStorage, keyed by date, and naturally
// resets each day. The durable record is the Activity's own Last Done
// date once you actually tick it off (see api/activities.js PATCH).

function todayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `life-organiser.daily-plan.${y}-${m}-${d}`;
}

export function getTodayPlanIds() {
  try {
    const raw = window.localStorage.getItem(todayKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setTodayPlanIds(ids) {
  try {
    window.localStorage.setItem(todayKey(), JSON.stringify(ids));
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — fail silently,
    // the plan just won't persist across reloads this session.
  }
}

export function addToTodayPlan(activityId) {
  const ids = getTodayPlanIds();
  if (!ids.includes(activityId)) {
    setTodayPlanIds([...ids, activityId]);
  }
}

export function removeFromTodayPlan(activityId) {
  const ids = getTodayPlanIds();
  setTodayPlanIds(ids.filter((id) => id !== activityId));
}

export function todayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
