const { notion, DATA_SOURCES, queryAll, sendJson } = require('../notion');
const { getFoods, findOrCreateFood } = require('../foods');
const { getTitle, getDate, getSelect, getRelationIds } = require('../notion-utils');

const VALID_MEAL = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

function normalizeEntry(page, foodsMap) {
  const props = page.properties;
  const foodIds = getRelationIds(props.Food);
  const food = foodsMap.get(foodIds[0]) || null;
  return {
    id: page.id,
    name: getTitle(props.Name),
    foodId: food?.id ?? null,
    date: getDate(props.Date),
    meal: getSelect(props.Meal),
    calories: props.Calories?.number ?? null,
    protein: props.Protein?.number ?? null,
    carbs: props.Carbs?.number ?? null,
    fat: props.Fat?.number ?? null,
  };
}

async function getFoodsMap() {
  const foods = await getFoods();
  return new Map(foods.map((f) => [f.id, f]));
}

async function handleGet(req, res) {
  const { date } = req.query;
  const [pages, foodsMap] = await Promise.all([
    queryAll(DATA_SOURCES.foodLog, {
      ...(date ? { filter: { property: 'Date', date: { equals: date } } } : {}),
      sorts: [{ property: 'Date', direction: 'descending' }],
    }),
    getFoodsMap(),
  ]);
  const entries = pages.map((page) => normalizeEntry(page, foodsMap));
  return sendJson(res, 200, { entries });
}

async function handlePost(req, res) {
  const { foodName, date, meal, calories, protein, carbs, fat } = req.body || {};
  if (!foodName || !foodName.trim()) {
    return sendJson(res, 400, { error: 'foodName is required' });
  }
  if (!date) {
    return sendJson(res, 400, { error: 'date is required' });
  }
  if (meal && !VALID_MEAL.includes(meal)) {
    return sendJson(res, 400, { error: `meal must be one of ${VALID_MEAL.join(', ')}` });
  }

  const food = await findOrCreateFood(foodName, { calories, protein, carbs, fat });

  const properties = {
    Name: { title: [{ text: { content: food.name } }] },
    Food: { relation: [{ id: food.id }] },
    Date: { date: { start: date } },
  };
  if (meal) properties.Meal = { select: { name: meal } };
  // Entries store their own copy of the macros (from what was typed, or
  // the matched food's defaults if left blank) rather than only relying on
  // the Food relation, so a bigger/smaller portion that day doesn't force
  // editing the food's stored defaults.
  const resolvedCalories = calories !== undefined && calories !== '' ? calories : food.calories;
  const resolvedProtein = protein !== undefined && protein !== '' ? protein : food.protein;
  const resolvedCarbs = carbs !== undefined && carbs !== '' ? carbs : food.carbs;
  const resolvedFat = fat !== undefined && fat !== '' ? fat : food.fat;
  if (resolvedCalories !== undefined && resolvedCalories !== null) properties.Calories = { number: Number(resolvedCalories) };
  if (resolvedProtein !== undefined && resolvedProtein !== null) properties.Protein = { number: Number(resolvedProtein) };
  if (resolvedCarbs !== undefined && resolvedCarbs !== null) properties.Carbs = { number: Number(resolvedCarbs) };
  if (resolvedFat !== undefined && resolvedFat !== null) properties.Fat = { number: Number(resolvedFat) };

  const [page, foodsMap] = await Promise.all([
    notion.pages.create({
      parent: { type: 'data_source_id', data_source_id: DATA_SOURCES.foodLog },
      properties,
    }),
    getFoodsMap(),
  ]);
  return sendJson(res, 201, { entry: normalizeEntry(page, foodsMap) });
}

async function handlePatch(req, res) {
  const { id, date, meal, calories, protein, carbs, fat } = req.body || {};
  if (!id) {
    return sendJson(res, 400, { error: 'id is required' });
  }
  const noFieldsGiven = [date, meal, calories, protein, carbs, fat].every((v) => v === undefined);
  if (noFieldsGiven) {
    return sendJson(res, 400, { error: 'at least one field to update is required' });
  }
  if (meal && !VALID_MEAL.includes(meal)) {
    return sendJson(res, 400, { error: `meal must be one of ${VALID_MEAL.join(', ')}` });
  }

  const properties = {};
  if (date !== undefined) properties.Date = { date: date ? { start: date } : null };
  if (meal !== undefined) properties.Meal = { select: meal ? { name: meal } : null };
  if (calories !== undefined) properties.Calories = { number: calories === '' || calories === null ? null : Number(calories) };
  if (protein !== undefined) properties.Protein = { number: protein === '' || protein === null ? null : Number(protein) };
  if (carbs !== undefined) properties.Carbs = { number: carbs === '' || carbs === null ? null : Number(carbs) };
  if (fat !== undefined) properties.Fat = { number: fat === '' || fat === null ? null : Number(fat) };

  const [page, foodsMap] = await Promise.all([
    notion.pages.update({ page_id: id, properties }),
    getFoodsMap(),
  ]);
  return sendJson(res, 200, { entry: normalizeEntry(page, foodsMap) });
}

async function handleDelete(req, res) {
  const { id } = req.query;
  if (!id) {
    return sendJson(res, 400, { error: 'id is required' });
  }
  await notion.pages.update({ page_id: id, archived: true });
  return sendJson(res, 200, { ok: true });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    if (req.method === 'PATCH') return await handlePatch(req, res);
    if (req.method === 'DELETE') return await handleDelete(req, res);
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(`${req.method} /api/food-log failed`, err);
    return sendJson(res, 500, { error: 'Failed to process food log request' });
  }
};
