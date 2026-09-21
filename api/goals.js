const { notion, DATA_SOURCES, queryAll, sendJson } = require('./_lib/notion');
const { getAreasMap } = require('./_lib/areas');
const {
  getTitle,
  getRichText,
  getSelect,
  getDate,
  getRelationIds,
} = require('./_lib/notion-utils');

const VALID_TIMEFRAMES = ['This Week', 'This Month', 'This Quarter', 'This Year', 'Long Term'];

function normalizeGoal(page, areasMap) {
  const props = page.properties;
  const areaIds = getRelationIds(props.Area);
  const area = areasMap.get(areaIds[0]) || null;
  return {
    id: page.id,
    name: getTitle(props.Goal),
    timeframe: getSelect(props.Timeframe),
    target: getRichText(props.Target),
    status: getSelect(props.Status),
    dueDate: getDate(props['Due Date']),
    areaId: area?.id ?? null,
    areaName: area?.name ?? null,
    projectIds: getRelationIds(props['Project Link']),
  };
}

async function handleGet(req, res) {
  const { timeframe } = req.query;
  if (timeframe && !VALID_TIMEFRAMES.includes(timeframe)) {
    return sendJson(res, 400, { error: `timeframe must be one of ${VALID_TIMEFRAMES.join(', ')}` });
  }
  const queryParams = timeframe
    ? { filter: { property: 'Timeframe', select: { equals: timeframe } } }
    : {};
  const [pages, areasMap] = await Promise.all([
    queryAll(DATA_SOURCES.goals, queryParams),
    getAreasMap(),
  ]);
  const goals = pages.map((page) => normalizeGoal(page, areasMap));
  return sendJson(res, 200, { goals });
}

async function handlePost(req, res) {
  const { name, areaId, timeframe } = req.body || {};
  if (!name || !name.trim()) {
    return sendJson(res, 400, { error: 'name is required' });
  }
  if (timeframe !== undefined && !VALID_TIMEFRAMES.includes(timeframe)) {
    return sendJson(res, 400, { error: `timeframe must be one of ${VALID_TIMEFRAMES.join(', ')}` });
  }

  const properties = {
    Goal: { title: [{ text: { content: name.trim() } }] },
    Timeframe: { select: { name: timeframe || 'This Month' } },
  };
  if (areaId) properties.Area = { relation: [{ id: areaId }] };

  const [page, areasMap] = await Promise.all([
    notion.pages.create({
      parent: { type: 'data_source_id', data_source_id: DATA_SOURCES.goals },
      properties,
    }),
    getAreasMap(),
  ]);
  return sendJson(res, 201, { goal: normalizeGoal(page, areasMap) });
}

async function handlePatch(req, res) {
  const { id, timeframe } = req.body || {};
  if (!id) {
    return sendJson(res, 400, { error: 'id is required' });
  }
  if (!timeframe || !VALID_TIMEFRAMES.includes(timeframe)) {
    return sendJson(res, 400, { error: `timeframe must be one of ${VALID_TIMEFRAMES.join(', ')}` });
  }

  const [page, areasMap] = await Promise.all([
    notion.pages.update({
      page_id: id,
      properties: { Timeframe: { select: { name: timeframe } } },
    }),
    getAreasMap(),
  ]);
  return sendJson(res, 200, { goal: normalizeGoal(page, areasMap) });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    if (req.method === 'PATCH') return await handlePatch(req, res);
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(`${req.method} /api/goals failed`, err);
    return sendJson(res, 500, { error: 'Failed to process goals request' });
  }
};
