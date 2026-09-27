const { DATA_SOURCES, queryAll, notion } = require('./notion');
const { getTitle } = require('./notion-utils');

function normalizeFood(page) {
  const props = page.properties;
  return {
    id: page.id,
    name: getTitle(props.Name),
    calories: props.Calories?.number ?? null,
    protein: props.Protein?.number ?? null,
    carbs: props.Carbs?.number ?? null,
    fat: props.Fat?.number ?? null,
  };
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = null;
let cachedAt = 0;

async function getFoods() {
  const now = Date.now();
  if (cache && now - cachedAt < CACHE_TTL_MS) return cache;
  const pages = await queryAll(DATA_SOURCES.foods);
  cache = pages.map(normalizeFood);
  cachedAt = now;
  return cache;
}

function invalidateFoodsCache() {
  cache = null;
}

// Case-insensitive find-or-create — mirrors api/_lib/exercises.js. When a
// match is found, its stored macros are returned as defaults for the log
// form to pre-fill (and the caller may still override them per entry).
async function findOrCreateFood(name, defaults = {}) {
  const trimmed = name.trim();
  const existing = await getFoods();
  const match = existing.find((f) => f.name.toLowerCase() === trimmed.toLowerCase());
  if (match) return match;

  const properties = { Name: { title: [{ text: { content: trimmed } }] } };
  if (defaults.calories !== undefined && defaults.calories !== null && defaults.calories !== '') {
    properties.Calories = { number: Number(defaults.calories) };
  }
  if (defaults.protein !== undefined && defaults.protein !== null && defaults.protein !== '') {
    properties.Protein = { number: Number(defaults.protein) };
  }
  if (defaults.carbs !== undefined && defaults.carbs !== null && defaults.carbs !== '') {
    properties.Carbs = { number: Number(defaults.carbs) };
  }
  if (defaults.fat !== undefined && defaults.fat !== null && defaults.fat !== '') {
    properties.Fat = { number: Number(defaults.fat) };
  }

  const page = await notion.pages.create({
    parent: { type: 'data_source_id', data_source_id: DATA_SOURCES.foods },
    properties,
  });
  invalidateFoodsCache();
  return normalizeFood(page);
}

module.exports = { getFoods, invalidateFoodsCache, findOrCreateFood, normalizeFood };
