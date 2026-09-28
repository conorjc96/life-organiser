const { notion, sendJson } = require('../notion');
const { getExercises, invalidateExercisesCache, normalizeExercise } = require('../exercises');

const VALID_CATEGORY = ['Push', 'Pull', 'Legs', 'Core', 'Cardio', 'Other'];

async function handleGet(req, res) {
  const exercises = await getExercises();
  return sendJson(res, 200, { exercises });
}

async function handlePatch(req, res) {
  const { id, category } = req.body || {};
  if (!id || !category) {
    return sendJson(res, 400, { error: 'id and category are required' });
  }
  if (!VALID_CATEGORY.includes(category)) {
    return sendJson(res, 400, { error: `category must be one of ${VALID_CATEGORY.join(', ')}` });
  }
  const page = await notion.pages.update({
    page_id: id,
    properties: { Category: { select: { name: category } } },
  });
  invalidateExercisesCache();
  return sendJson(res, 200, { exercise: normalizeExercise(page) });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'PATCH') return await handlePatch(req, res);
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(`${req.method} /api/exercises failed`, err);
    return sendJson(res, 500, { error: 'Failed to process exercises request' });
  }
};
