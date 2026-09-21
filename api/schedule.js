const { notion, DATA_SOURCES, queryAll, sendJson } = require('./_lib/notion');
const { getAreasMap } = require('./_lib/areas');
const { getTitle, getSelect, getRelationIds } = require('./_lib/notion-utils');

// Start/End are stored and read as naive local wall-clock strings
// ("2026-09-21T09:00:00", no timezone suffix) — Notion echoes them back
// with a "+00:00" appended, but the hour/minute digits are never shifted,
// so treating them as plain strings (not `new Date(...).getHours()`,
// which WOULD apply a timezone conversion) avoids any timezone bugs for
// this single-user, single-timezone app.
function normalizeBlock(page, areasMap) {
  const props = page.properties;
  const areaIds = getRelationIds(props.Area);
  const area = areasMap.get(areaIds[0]) || null;
  return {
    id: page.id,
    name: getTitle(props.Name),
    start: props.Start?.date?.start ?? null,
    end: props.End?.date?.start ?? null,
    areaId: area?.id ?? null,
    areaName: area?.name ?? null,
    areaIcon: area?.icon ?? null,
    source: getSelect(props.Source),
  };
}

function nextDateString(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

async function handleGet(req, res) {
  const { date } = req.query;
  if (!date) {
    return sendJson(res, 400, { error: 'date is required (YYYY-MM-DD)' });
  }
  const [pages, areasMap] = await Promise.all([
    queryAll(DATA_SOURCES.schedule, {
      filter: {
        and: [
          { property: 'Start', date: { on_or_after: date } },
          { property: 'Start', date: { before: nextDateString(date) } },
        ],
      },
      sorts: [{ property: 'Start', direction: 'ascending' }],
    }),
    getAreasMap(),
  ]);
  const blocks = pages.map((page) => normalizeBlock(page, areasMap));
  return sendJson(res, 200, { blocks });
}

async function handlePost(req, res) {
  const { name, start, end, areaId, source } = req.body || {};
  if (!name || !name.trim() || !start || !end) {
    return sendJson(res, 400, { error: 'name, start, and end are required' });
  }

  const properties = {
    Name: { title: [{ text: { content: name.trim() } }] },
    Start: { date: { start } },
    End: { date: { start: end } },
    Source: { select: { name: source || 'Manual' } },
  };
  if (areaId) properties.Area = { relation: [{ id: areaId }] };

  const [page, areasMap] = await Promise.all([
    notion.pages.create({
      parent: { type: 'data_source_id', data_source_id: DATA_SOURCES.schedule },
      properties,
    }),
    getAreasMap(),
  ]);
  return sendJson(res, 201, { block: normalizeBlock(page, areasMap) });
}

async function handlePatch(req, res) {
  const { id, name, start, end, areaId } = req.body || {};
  if (!id) {
    return sendJson(res, 400, { error: 'id is required' });
  }

  const properties = {};
  if (name !== undefined) properties.Name = { title: [{ text: { content: name.trim() } }] };
  if (start !== undefined) properties.Start = { date: { start } };
  if (end !== undefined) properties.End = { date: { start: end } };
  if (areaId !== undefined) properties.Area = { relation: areaId ? [{ id: areaId }] : [] };

  const [page, areasMap] = await Promise.all([
    notion.pages.update({ page_id: id, properties }),
    getAreasMap(),
  ]);
  return sendJson(res, 200, { block: normalizeBlock(page, areasMap) });
}

async function handleDelete(req, res) {
  const { id } = req.query;
  if (!id) {
    return sendJson(res, 400, { error: 'id is required' });
  }
  await notion.pages.update({ page_id: id, archived: true });
  return sendJson(res, 200, { ok: true });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    if (req.method === 'PATCH') return await handlePatch(req, res);
    if (req.method === 'DELETE') return await handleDelete(req, res);
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(`${req.method} /api/schedule failed`, err);
    return sendJson(res, 500, { error: 'Failed to process schedule request' });
  }
};
