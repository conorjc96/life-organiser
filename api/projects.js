const { DATA_SOURCES, queryAll, sendJson } = require('./_lib/notion');
const { getAreasMap } = require('./_lib/areas');
const {
  getTitle,
  getSelect,
  getCheckbox,
  getRelationIds,
  getRollup,
} = require('./_lib/notion-utils');

// "Done Tasks" is a Notion rollup configured with function "show_original",
// so it comes back as the raw array of related Tasks' Status property
// (not a count) — and the Notion-side "% Complete" formula divides by that
// array, which is why it evaluates to null. Count and compute here instead.
function countDoneTasks(rollupArray) {
  if (!Array.isArray(rollupArray)) return 0;
  return rollupArray.filter((entry) => entry?.select?.name === 'Done').length;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { areaId } = req.query;

  try {
    const queryParams = areaId
      ? { filter: { property: 'Area', relation: { contains: areaId } } }
      : {};
    const [pages, areasMap] = await Promise.all([
      queryAll(DATA_SOURCES.projects, queryParams),
      getAreasMap(),
    ]);

    const projects = pages.map((page) => {
      const props = page.properties;
      const areaIds = getRelationIds(props.Area);
      const area = areasMap.get(areaIds[0]) || null;
      const totalTasks = getRollup(props['Total Tasks']) || 0;
      const doneTasks = countDoneTasks(getRollup(props['Done Tasks']));
      return {
        id: page.id,
        name: getTitle(props.Project),
        status: getSelect(props.Status),
        areaId: area?.id ?? null,
        areaName: area?.name ?? null,
        goalIds: getRelationIds(props.Goals),
        taskIds: getRelationIds(props.Tasks),
        totalTasks,
        doneTasks,
        percentComplete: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
        focusThisWeek: getCheckbox(props['Focus This Week']),
      };
    });

    return sendJson(res, 200, { projects });
  } catch (err) {
    console.error('GET /api/projects failed', err);
    return sendJson(res, 500, { error: 'Failed to load projects' });
  }
};
