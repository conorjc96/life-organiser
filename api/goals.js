const { DATA_SOURCES, queryAll, sendJson } = require('./_lib/notion');
const { getAreasMap } = require('./_lib/areas');
const {
  getTitle,
  getRichText,
  getSelect,
  getDate,
  getRelationIds,
} = require('./_lib/notion-utils');

const VALID_TIMEFRAMES = ['This Week', 'This Month', 'This Quarter', 'This Year', 'Long Term'];

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { timeframe } = req.query;
  if (timeframe && !VALID_TIMEFRAMES.includes(timeframe)) {
    return sendJson(res, 400, { error: `timeframe must be one of ${VALID_TIMEFRAMES.join(', ')}` });
  }

  try {
    const queryParams = timeframe
      ? { filter: { property: 'Timeframe', select: { equals: timeframe } } }
      : {};
    const [pages, areasMap] = await Promise.all([
      queryAll(DATA_SOURCES.goals, queryParams),
      getAreasMap(),
    ]);

    const goals = pages.map((page) => {
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
    });

    return sendJson(res, 200, { goals });
  } catch (err) {
    console.error('GET /api/goals failed', err);
    return sendJson(res, 500, { error: 'Failed to load goals' });
  }
};
