const { notion, DATA_SOURCES, queryAll, sendJson } = require('./_lib/notion');
const { getAreasMap } = require('./_lib/areas');
const { getDate, getRelationIds } = require('./_lib/notion-utils');

function normalizeRating(page, areasMap) {
  const props = page.properties;
  const areaIds = getRelationIds(props.Area);
  const area = areasMap.get(areaIds[0]) || null;
  return {
    id: page.id,
    month: getDate(props.Month),
    areaId: area?.id ?? null,
    areaName: area?.name ?? null,
    score: props.Score?.number ?? null,
  };
}

async function handleGet(req, res) {
  const { month } = req.query;
  if (!month) {
    return sendJson(res, 400, { error: 'month is required (YYYY-MM-01)' });
  }
  const [pages, areasMap] = await Promise.all([
    queryAll(DATA_SOURCES.lifeWheel, {
      filter: { property: 'Month', date: { equals: month } },
    }),
    getAreasMap(),
  ]);
  const ratings = pages.map((page) => normalizeRating(page, areasMap));
  return sendJson(res, 200, { ratings });
}

async function handlePatch(req, res) {
  const { month, areaId, score } = req.body || {};
  if (!month || !areaId || score === undefined) {
    return sendJson(res, 400, { error: 'month, areaId, and score are required' });
  }
  if (score < 0 || score > 10) {
    return sendJson(res, 400, { error: 'score must be between 0 and 10' });
  }

  const [existing, areasMap] = await Promise.all([
    queryAll(DATA_SOURCES.lifeWheel, {
      filter: {
        and: [
          { property: 'Month', date: { equals: month } },
          { property: 'Area', relation: { contains: areaId } },
        ],
      },
    }),
    getAreasMap(),
  ]);

  let page;
  if (existing.length > 0) {
    page = await notion.pages.update({
      page_id: existing[0].id,
      properties: { Score: { number: score } },
    });
  } else {
    const area = areasMap.get(areaId);
    page = await notion.pages.create({
      parent: { type: 'data_source_id', data_source_id: DATA_SOURCES.lifeWheel },
      properties: {
        Name: { title: [{ text: { content: `${area?.name || 'Area'} — ${month}` } }] },
        Month: { date: { start: month } },
        Area: { relation: [{ id: areaId }] },
        Score: { number: score },
      },
    });
  }
  return sendJson(res, 200, { rating: normalizeRating(page, areasMap) });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'PATCH') return await handlePatch(req, res);
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(`${req.method} /api/life-wheel failed`, err);
    return sendJson(res, 500, { error: 'Failed to process life wheel request' });
  }
};
