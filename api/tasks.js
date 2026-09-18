const { notion, DATA_SOURCES, queryAll, sendJson } = require('./_lib/notion');
const { getProjectsMap } = require('./_lib/projects');
const { getTitle, getSelect, getDate, getRelationIds } = require('./_lib/notion-utils');

const VALID_WHEN = ['Today', 'This Week', 'Backlog'];
const VALID_STATUS = ['To Do', 'In Progress', 'Done', 'Cancelled'];

function normalizeTask(page, projectsMap) {
  const props = page.properties;
  const projectIds = getRelationIds(props['Project Link']);
  const project = projectsMap.get(projectIds[0]) || null;
  return {
    id: page.id,
    name: getTitle(props.Task),
    when: getSelect(props.When),
    priority: getSelect(props.Priority),
    status: getSelect(props.Status),
    due: getDate(props.Due),
    area: getSelect(props.Area),
    projectIds,
    projectName: project?.name ?? null,
    projectIcon: project?.icon ?? null,
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
  const [pages, projectsMap] = await Promise.all([
    queryAll(DATA_SOURCES.tasks, buildFilter(when, projectId)),
    getProjectsMap(),
  ]);
  const tasks = pages.map((page) => normalizeTask(page, projectsMap));
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

  const [page, projectsMap] = await Promise.all([
    notion.pages.update({ page_id: id, properties }),
    getProjectsMap(),
  ]);
  return sendJson(res, 200, { task: normalizeTask(page, projectsMap) });
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
