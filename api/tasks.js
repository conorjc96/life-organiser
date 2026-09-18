const { notion, DATA_SOURCES, queryAll, sendJson } = require('./_lib/notion');
const { getTitle, getSelect, getDate, getRelationIds } = require('./_lib/notion-utils');

const VALID_WHEN = ['Today', 'This Week', 'Backlog'];
const VALID_STATUS = ['To Do', 'In Progress', 'Done', 'Cancelled'];

function normalizeTask(page) {
  const props = page.properties;
  return {
    id: page.id,
    name: getTitle(props.Task),
    when: getSelect(props.When),
    priority: getSelect(props.Priority),
    status: getSelect(props.Status),
    due: getDate(props.Due),
    area: getSelect(props.Area),
    projectIds: getRelationIds(props['Project Link']),
  };
}

function buildFilter(when, projectId) {
  const conditions = [];
  if (when) conditions.push({ property: 'When', select: { equals: when } });
  if (projectId) conditions.push({ property: 'Project Link', relation: { contains: projectId } });
  if (conditions.length === 0) return {};
  if (conditions.length === 1) return { filter: conditions[0] };
  return { filter: { and: conditions } };
}

async function handleGet(req, res) {
  const { when, projectId } = req.query;
  if (when && !VALID_WHEN.includes(when)) {
    return sendJson(res, 400, { error: `when must be one of ${VALID_WHEN.join(', ')}` });
  }
  const pages = await queryAll(DATA_SOURCES.tasks, buildFilter(when, projectId));
  const tasks = pages.map(normalizeTask);
  return sendJson(res, 200, { tasks });
}

async function handlePatch(req, res) {
  const { id, status, when } = req.body || {};
  if (!id) {
    return sendJson(res, 400, { error: 'id is required' });
  }
  if (status === undefined && when === undefined) {
    return sendJson(res, 400, { error: 'status or when is required' });
  }
  if (status !== undefined && !VALID_STATUS.includes(status)) {
    return sendJson(res, 400, { error: `status must be one of ${VALID_STATUS.join(', ')}` });
  }
  if (when !== undefined && !VALID_WHEN.includes(when)) {
    return sendJson(res, 400, { error: `when must be one of ${VALID_WHEN.join(', ')}` });
  }

  const properties = {};
  if (status !== undefined) properties.Status = { select: { name: status } };
  if (when !== undefined) properties.When = { select: { name: when } };

  const page = await notion.pages.update({ page_id: id, properties });
  return sendJson(res, 200, { task: normalizeTask(page) });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'PATCH') return await handlePatch(req, res);
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(`${req.method} /api/tasks failed`, err);
    return sendJson(res, 500, { error: 'Failed to process tasks request' });
  }
};
