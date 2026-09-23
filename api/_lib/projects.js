const { DATA_SOURCES, queryAll } = require('./notion');
const { getAreasMap } = require('./areas');
const { getTitle, getSelect, getCheckbox, getRelationIds, getRollup } = require('./notion-utils');

// "Done Tasks" is a Notion rollup configured with function "show_original",
// so it comes back as the raw array of related Tasks' Status property
// (not a count) — and the Notion-side "% Complete" formula divides by that
// array, which is why it evaluates to null. Count and compute here instead.
function countDoneTasks(rollupArray) {
  if (!Array.isArray(rollupArray)) return 0;
  return rollupArray.filter((entry) => entry?.select?.name === 'Done').length;
}

function normalizeProject(page, areasMap) {
  const props = page.properties;
  const areaIds = getRelationIds(props.Area);
  const area = areasMap.get(areaIds[0]) || null;
  const totalTasks = getRollup(props['Total Tasks']) || 0;
  const doneTasks = countDoneTasks(getRollup(props['Done Tasks']));
  return {
    id: page.id,
    name: getTitle(props.Project),
    icon: page.icon?.type === 'emoji' ? page.icon.emoji : null,
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
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = null;
let cachedAt = 0;

async function getProjects() {
  const now = Date.now();
  if (cache && now - cachedAt < CACHE_TTL_MS) return cache;
  const [pages, areasMap] = await Promise.all([queryAll(DATA_SOURCES.projects), getAreasMap()]);
  cache = pages.map((page) => normalizeProject(page, areasMap));
  cachedAt = now;
  return cache;
}

async function getProjectsMap() {
  const projects = await getProjects();
  return new Map(projects.map((project) => [project.id, project]));
}

// Called after writing a project (e.g. toggling "Focus This Week") so the
// next GET doesn't serve the stale pre-write list for up to CACHE_TTL_MS.
function invalidateProjectsCache() {
  cache = null;
}

module.exports = { getProjects, getProjectsMap, normalizeProject, invalidateProjectsCache };
