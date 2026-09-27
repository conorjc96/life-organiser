const { DATA_SOURCES, queryAll, notion } = require('./notion');
const { getTitle, getSelect } = require('./notion-utils');

function normalizeExercise(page) {
  const props = page.properties;
  return {
    id: page.id,
    name: getTitle(props.Name),
    category: getSelect(props.Category),
  };
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = null;
let cachedAt = 0;

async function getExercises() {
  const now = Date.now();
  if (cache && now - cachedAt < CACHE_TTL_MS) return cache;
  const pages = await queryAll(DATA_SOURCES.exercises);
  cache = pages.map(normalizeExercise);
  cachedAt = now;
  return cache;
}

function invalidateExercisesCache() {
  cache = null;
}

// Case-insensitive find-or-create, so logging a set never requires a
// separate "add exercise first" step — typing a new name in the Workout
// tab's log form just creates it.
async function findOrCreateExercise(name) {
  const trimmed = name.trim();
  const existing = await getExercises();
  const match = existing.find((e) => e.name.toLowerCase() === trimmed.toLowerCase());
  if (match) return match;

  const page = await notion.pages.create({
    parent: { type: 'data_source_id', data_source_id: DATA_SOURCES.exercises },
    properties: {
      Name: { title: [{ text: { content: trimmed } }] },
    },
  });
  invalidateExercisesCache();
  return normalizeExercise(page);
}

module.exports = { getExercises, invalidateExercisesCache, findOrCreateExercise, normalizeExercise };
