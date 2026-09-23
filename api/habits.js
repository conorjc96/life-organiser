const { notion, DATA_SOURCES, queryAll, sendJson } = require('./_lib/notion');
const { getTitle, getSelect, getCheckbox } = require('./_lib/notion-utils');

// This database is a weekly grid, not a daily log: one row per habit, with
// a standing checkbox per weekday (Mon-Sun) that gets manually re-checked
// each week — there's no per-date row, so "today" just means reading/
// writing whichever weekday property matches the current day name.
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function normalizeHabit(page) {
  const props = page.properties;
  const days = {};
  for (const day of DAYS) days[day] = getCheckbox(props[day]);
  return {
    id: page.id,
    name: getTitle(props.Habit),
    category: getSelect(props.Category),
    frequency: getSelect(props.Frequency),
    weeklyTarget: props['Weekly Target']?.number ?? null,
    active: getCheckbox(props.Active),
    days,
  };
}

async function handleGet(req, res) {
  const pages = await queryAll(DATA_SOURCES.habits, {});
  const habits = pages.map(normalizeHabit);
  return sendJson(res, 200, { habits });
}

async function handlePatch(req, res) {
  const { id, day, value } = req.body || {};
  if (!id || !day) {
    return sendJson(res, 400, { error: 'id and day are required' });
  }
  if (!DAYS.includes(day)) {
    return sendJson(res, 400, { error: `day must be one of ${DAYS.join(', ')}` });
  }

  const page = await notion.pages.update({
    page_id: id,
    properties: { [day]: { checkbox: Boolean(value) } },
  });
  return sendJson(res, 200, { habit: normalizeHabit(page) });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'PATCH') return await handlePatch(req, res);
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(`${req.method} /api/habits failed`, err);
    return sendJson(res, 500, { error: 'Failed to process habits request' });
  }
};
