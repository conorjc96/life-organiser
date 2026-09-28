const { notion, DATA_SOURCES, sendJson } = require('../notion');
const { getFoods, invalidateFoodsCache, normalizeFood } = require('../foods');

async function handleGet(req, res) {
  const foods = await getFoods();
  return sendJson(res, 200, { foods });
}

// Explicit "add a new food" from the Food tab's own management form — kept
// separate from findOrCreateFood (used when logging an entry), which
// silently returns the existing food on a name match rather than erroring.
// Here a duplicate name is almost certainly a mistake worth surfacing.
async function handlePost(req, res) {
  const { name, calories, protein, carbs, fat } = req.body || {};
  if (!name || !name.trim()) {
    return sendJson(res, 400, { error: 'name is required' });
  }
  const trimmed = name.trim();
  const existing = await getFoods();
  if (existing.some((f) => f.name.toLowerCase() === trimmed.toLowerCase())) {
    return sendJson(res, 409, { error: `"${trimmed}" already exists` });
  }

  const properties = { Name: { title: [{ text: { content: trimmed } }] } };
  if (calories !== undefined && calories !== '') properties.Calories = { number: Number(calories) };
  if (protein !== undefined && protein !== '') properties.Protein = { number: Number(protein) };
  if (carbs !== undefined && carbs !== '') properties.Carbs = { number: Number(carbs) };
  if (fat !== undefined && fat !== '') properties.Fat = { number: Number(fat) };

  const page = await notion.pages.create({
    parent: { type: 'data_source_id', data_source_id: DATA_SOURCES.foods },
    properties,
  });
  invalidateFoodsCache();
  return sendJson(res, 201, { food: normalizeFood(page) });
}

// Lets you correct a food's stored defaults (e.g. you mis-entered
// calories the first time) without touching every past log entry, which
// intentionally keep their own copied values.
async function handlePatch(req, res) {
  const { id, calories, protein, carbs, fat } = req.body || {};
  if (!id) {
    return sendJson(res, 400, { error: 'id is required' });
  }
  const noFieldsGiven = [calories, protein, carbs, fat].every((v) => v === undefined);
  if (noFieldsGiven) {
    return sendJson(res, 400, { error: 'at least one field to update is required' });
  }

  const properties = {};
  if (calories !== undefined) properties.Calories = { number: calories === '' ? null : Number(calories) };
  if (protein !== undefined) properties.Protein = { number: protein === '' ? null : Number(protein) };
  if (carbs !== undefined) properties.Carbs = { number: carbs === '' ? null : Number(carbs) };
  if (fat !== undefined) properties.Fat = { number: fat === '' ? null : Number(fat) };

  const page = await notion.pages.update({ page_id: id, properties });
  invalidateFoodsCache();
  return sendJson(res, 200, { food: normalizeFood(page) });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    if (req.method === 'PATCH') return await handlePatch(req, res);
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(`${req.method} /api/foods failed`, err);
    return sendJson(res, 500, { error: 'Failed to process foods request' });
  }
};
