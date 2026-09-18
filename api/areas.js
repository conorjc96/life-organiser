const { sendJson } = require('./_lib/notion');
const { getAreas } = require('./_lib/areas');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  try {
    const areas = await getAreas();
    return sendJson(res, 200, { areas });
  } catch (err) {
    console.error('GET /api/areas failed', err);
    return sendJson(res, 500, { error: 'Failed to load areas' });
  }
};
