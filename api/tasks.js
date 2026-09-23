const { notion, DATA_SOURCES, queryAll, sendJson } = require('./_lib/notion');
const { getProjectsMap } = require('./_lib/projects');
const { getTitle, getSelect, getDate, getRelationIds } = require('./_lib/notion-utils');

const VALID_WHEN = ['Today', 'This Week', 'Backlog'];
const VALID_STATUS = ['To Do', 'In Progress', 'Done', 'Cancelled'];
const VALID_PRIORITY = ['High', 'Medium', 'Low'];

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
    // Tasks have no "completed on" field, but every Notion page is
    // auto-timestamped — used as a "last touched" proxy for a project
    // (completing one of its tasks is the most common edit to it).
    lastEditedTime: page.last_edited_time,
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

async function handlePost(req, res) {
  const { name, projectId, when } = req.body || {};
  if (!name || !name.trim()) {
    return sendJson(res, 400, { error: 'name is required' });
  }
  if (when !== undefined && !VALID_WHEN.includes(when)) {
    return sendJson(res, 400, { error: `when must be one of ${VALID_WHEN.join(', ')}` });
  }

  const properties = {
    Task: { title: [{ text: { content: name.trim() } }] },
    Status: { select: { name: 'To Do' } },
    When: { select: { name: when || 'Backlog' } },
  };
  if (projectId) properties['Project Link'] = { relation: [{ id: projectId }] };

  const [page, projectsMap] = await Promise.all([
    notion.pages.create({
      parent: { type: 'data_source_id', data_source_id: DATA_SOURCES.tasks },
      properties,
    }),
    getProjectsMap(),
  ]);
  return sendJson(res, 201, { task: normalizeTask(page, projectsMap) });
}

async function handlePatch(req, res) {
  const { id, name, status, when, priority, due, area, projectId } = req.body || {};
  if (!id) {
    return sendJson(res, 400, { error: 'id is required' });
  }
  const noFieldsGiven = [name, status, when, priority, due, area, projectId].every(
    (v) => v === undefined
  );
  if (noFieldsGiven) {
    return sendJson(res, 400, { error: 'at least one field to update is required' });
  }
  if (name !== undefined && !name.trim()) {
    return sendJson(res, 400, { error: 'name cannot be empty' });
  }
  if (status !== undefined && !VALID_STATUS.includes(status)) {
    return sendJson(res, 400, { error: `status must be one of ${VALID_STATUS.join(', ')}` });
  }
  if (when !== undefined && !VALID_WHEN.includes(when)) {
    return sendJson(res, 400, { error: `when must be one of ${VALID_WHEN.join(', ')}` });
  }
  if (priority && !VALID_PRIORITY.includes(priority)) {
    return sendJson(res, 400, { error: `priority must be one of ${VALID_PRIORITY.join(', ')}` });
  }

  const properties = {};
  if (name !== undefined) properties.Task = { title: [{ text: { content: name.trim() } }] };
  if (status !== undefined) properties.Status = { select: { name: status } };
  if (when !== undefined) properties.When = { select: { name: when } };
  // Priority/Area/Due are all clearable — an empty string or null unsets
  // the select/date rather than being rejected as invalid input.
  if (priority !== undefined) properties.Priority = { select: priority ? { name: priority } : null };
  if (area !== undefined) properties.Area = { select: area ? { name: area } : null };
  if (due !== undefined) properties.Due = { date: due ? { start: due } : null };
  if (projectId !== undefined) properties['Project Link'] = { relation: projectId ? [{ id: projectId }] : [] };

  const [page, projectsMap] = await Promise.all([
    notion.pages.update({ page_id: id, properties }),
    getProjectsMap(),
  ]);
  return sendJson(res, 200, { task: normalizeTask(page, projectsMap) });
}

async function handleDelete(req, res) {
  const { id } = req.query;
  if (!id) {
    return sendJson(res, 400, { error: 'id is required' });
  }
  // Notion has no permanent delete via the API — archiving is its version
  // (recoverable from the workspace trash), same as Schedule's DELETE.
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
    console.error(`${req.method} /api/tasks failed`, err);
    return sendJson(res, 500, { error: 'Failed to process tasks request' });
  }
};
