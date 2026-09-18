const { sendJson } = require('./_lib/notion');
const { getProjects } = require('./_lib/projects');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { areaId } = req.query;

  try {
    const projects = await getProjects();
    const filtered = areaId ? projects.filter((p) => p.areaId === areaId) : projects;
    return sendJson(res, 200, { projects: filtered });
  } catch (err) {
    console.error('GET /api/projects failed', err);
    return sendJson(res, 500, { error: 'Failed to load projects' });
  }
};
