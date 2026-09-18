const { notion, DATA_SOURCES, queryAll, sendJson } = require('./_lib/notion');
const { getAreasMap } = require('./_lib/areas');
const { getTitle, getSelect, getDate, getRelationIds } = require('./_lib/notion-utils');

function normalizeActivity(page, areasMap) {
  const props = page.properties;
  const areaIds = getRelationIds(props.Area);
  const area = areasMap.get(areaIds[0]) || null;
  return {
    id: page.id,
    name: getTitle(props.Activity),
    type: getSelect(props.Type),
    duration: getSelect(props.Duration),
    lastDone: getDate(props['Last Done']),
    areaId: area?.id ?? null,
    areaName: area?.name ?? null,
  };
}

async function handleGet(req, res) {
  const { areaId } = req.query;
  const queryParams = areaId
    ? { filter: { property: 'Area', relation: { contains: areaId } } }
    : {};
  const [pages, areasMap] = await Promise.all([
    queryAll(DATA_SOURCES.activities, queryParams),
    getAreasMap(),
  ]);
  const activities = pages.map((page) => normalizeActivity(page, areasMap));
  return sendJson(res, 200, { activities });
}

// Activities have no completion lifecycle of their own — the only thing
// worth persisting is when it was last actually done, so ticking one off
// on the Today/Activity Bank screens just stamps this single date field.
async function handlePatch(req, res) {
  const { id, lastDone } = req.body || {};
  if (!id) {
    return sendJson(res, 400, { error: 'id is required' });
  }
  const page = await notion.pages.update({
    page_id: id,
    properties: {
      'Last Done': { date: lastDone ? { start: lastDone } : null },
    },
  });
  const areasMap = await getAreasMap();
  return sendJson(res, 200, { activity: normalizeActivity(page, areasMap) });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'PATCH') return await handlePatch(req, res);
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(`${req.method} /api/activities failed`, err);
    return sendJson(res, 500, { error: 'Failed to process activities request' });
  }
};
