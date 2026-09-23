const { notion, sendJson } = require('./_lib/notion');
const { getProjects, normalizeProject, invalidateProjectsCache } = require('./_lib/projects');
const { getAreasMap } = require('./_lib/areas');

async function handleGet(req, res) {
  const { areaId } = req.query;
  const projects = await getProjects();
  const filtered = areaId ? projects.filter((p) => p.areaId === areaId) : projects;
  return sendJson(res, 200, { projects: filtered });
}

async function handlePatch(req, res) {
  const { id, focusThisWeek } = req.body || {};
  if (!id) {
    return sendJson(res, 400, { error: 'id is required' });
  }
  if (focusThisWeek === undefined) {
    return sendJson(res, 400, { error: 'focusThisWeek is required' });
  }

  const [page, areasMap] = await Promise.all([
    notion.pages.update({
      page_id: id,
      properties: { 'Focus This Week': { checkbox: Boolean(focusThisWeek) } },
    }),
    getAreasMap(),
  ]);
  invalidateProjectsCache();
  return sendJson(res, 200, { project: normalizeProject(page, areasMap) });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'PATCH') return await handlePatch(req, res);
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(`${req.method} /api/projects failed`, err);
    return sendJson(res, 500, { error: 'Failed to process projects request' });
  }
};
