// Shared data-gathering for the two notification cron jobs — deliberately
// separate from api/tasks.js/api/habits.js/api/schedule.js's own
// normalize functions (which return the fuller shape the UI needs); these
// just need names and a couple of flags for a push notification body.
const { DATA_SOURCES, queryAll } = require('./notion');
const { getTitle, getSelect, getCheckbox } = require('./notion-utils');

function todayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function nextDateString(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

async function getTodayScheduleCount() {
  const date = todayDateString();
  const pages = await queryAll(DATA_SOURCES.schedule, {
    filter: {
      and: [
        { property: 'Start', date: { on_or_after: date } },
        { property: 'Start', date: { before: nextDateString(date) } },
      ],
    },
  });
  return pages.length;
}

// Habits Tracker is a weekly grid (a standing checkbox per weekday, reused
// across weeks) — see [[project-life-organiser-habits]] — "today" just
// means reading whichever weekday property matches the current day.
const HABIT_DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function todayHabitDay() {
  return HABIT_DAY_KEYS[new Date().getDay()];
}

async function getIncompleteHabitNames() {
  const pages = await queryAll(DATA_SOURCES.habits);
  const todayKey = todayHabitDay();
  return pages
    .filter((page) => getCheckbox(page.properties.Active) && !getCheckbox(page.properties[todayKey]))
    .map((page) => getTitle(page.properties.Habit));
}

async function getIncompleteTodayTaskNames() {
  const pages = await queryAll(DATA_SOURCES.tasks, {
    filter: { property: 'When', select: { equals: 'Today' } },
  });
  return pages
    .filter((page) => getSelect(page.properties.Status) !== 'Done')
    .map((page) => getTitle(page.properties.Task));
}

module.exports = {
  todayDateString,
  getTodayScheduleCount,
  getIncompleteHabitNames,
  getIncompleteTodayTaskNames,
};
