const { DATA_SOURCES, queryAll } = require('./notion');
const { getTitle, getRichText } = require('./notion-utils');

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = null;
let cachedAt = 0;

function normalizeArea(page) {
  const props = page.properties;
  return {
    id: page.id,
    name: getTitle(props.Area),
    icon: getRichText(props.Icon),
    description: getRichText(props.Description),
  };
}

async function getAreas() {
  const now = Date.now();
  if (cache && now - cachedAt < CACHE_TTL_MS) return cache;
  const pages = await queryAll(DATA_SOURCES.areas);
  cache = pages.map(normalizeArea);
  cachedAt = now;
  return cache;
}

async function getAreasMap() {
  const areas = await getAreas();
  return new Map(areas.map((area) => [area.id, area]));
}

module.exports = { getAreas, getAreasMap, normalizeArea };
