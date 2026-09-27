const { notion, DATA_SOURCES, queryAll, sendJson } = require('./_lib/notion');
const { getExercises, findOrCreateExercise } = require('./_lib/exercises');
const { getTitle, getDate, getRichText, getRelationIds } = require('./_lib/notion-utils');

function normalizeEntry(page, exercisesMap) {
  const props = page.properties;
  const exerciseIds = getRelationIds(props.Exercise);
  const exercise = exercisesMap.get(exerciseIds[0]) || null;
  return {
    id: page.id,
    name: getTitle(props.Name),
    exerciseId: exercise?.id ?? null,
    exerciseName: exercise?.name ?? null,
    category: exercise?.category ?? null,
    date: getDate(props.Date),
    weight: props.Weight?.number ?? null,
    reps: props.Reps?.number ?? null,
    sets: props.Sets?.number ?? null,
    notes: getRichText(props.Notes) || null,
  };
}

async function getExercisesMap() {
  const exercises = await getExercises();
  return new Map(exercises.map((e) => [e.id, e]));
}

function buildFilter(exerciseId, date) {
  const conditions = [];
  if (exerciseId) conditions.push({ property: 'Exercise', relation: { contains: exerciseId } });
  if (date) conditions.push({ property: 'Date', date: { equals: date } });
  if (conditions.length === 0) return {};
  if (conditions.length === 1) return { filter: conditions[0] };
  return { filter: { and: conditions } };
}

async function handleGet(req, res) {
  const { exerciseId, date } = req.query;
  const [pages, exercisesMap] = await Promise.all([
    queryAll(DATA_SOURCES.workoutLog, {
      ...buildFilter(exerciseId, date),
      sorts: [{ property: 'Date', direction: 'descending' }],
    }),
    getExercisesMap(),
  ]);
  const entries = pages.map((page) => normalizeEntry(page, exercisesMap));
  return sendJson(res, 200, { entries });
}

async function handlePost(req, res) {
  const { exerciseName, date, weight, reps, sets, notes } = req.body || {};
  if (!exerciseName || !exerciseName.trim()) {
    return sendJson(res, 400, { error: 'exerciseName is required' });
  }
  if (!date) {
    return sendJson(res, 400, { error: 'date is required' });
  }

  const exercise = await findOrCreateExercise(exerciseName);

  const properties = {
    Name: { title: [{ text: { content: exercise.name } }] },
    Exercise: { relation: [{ id: exercise.id }] },
    Date: { date: { start: date } },
  };
  if (weight !== undefined && weight !== null && weight !== '') properties.Weight = { number: Number(weight) };
  if (reps !== undefined && reps !== null && reps !== '') properties.Reps = { number: Number(reps) };
  if (sets !== undefined && sets !== null && sets !== '') properties.Sets = { number: Number(sets) };
  if (notes) properties.Notes = { rich_text: [{ text: { content: notes } }] };

  const [page, exercisesMap] = await Promise.all([
    notion.pages.create({
      parent: { type: 'data_source_id', data_source_id: DATA_SOURCES.workoutLog },
      properties,
    }),
    getExercisesMap(),
  ]);
  return sendJson(res, 201, { entry: normalizeEntry(page, exercisesMap) });
}

async function handlePatch(req, res) {
  const { id, date, weight, reps, sets, notes } = req.body || {};
  if (!id) {
    return sendJson(res, 400, { error: 'id is required' });
  }
  const noFieldsGiven = [date, weight, reps, sets, notes].every((v) => v === undefined);
  if (noFieldsGiven) {
    return sendJson(res, 400, { error: 'at least one field to update is required' });
  }

  const properties = {};
  if (date !== undefined) properties.Date = { date: date ? { start: date } : null };
  if (weight !== undefined) properties.Weight = { number: weight === '' || weight === null ? null : Number(weight) };
  if (reps !== undefined) properties.Reps = { number: reps === '' || reps === null ? null : Number(reps) };
  if (sets !== undefined) properties.Sets = { number: sets === '' || sets === null ? null : Number(sets) };
  if (notes !== undefined) properties.Notes = { rich_text: notes ? [{ text: { content: notes } }] : [] };

  const [page, exercisesMap] = await Promise.all([
    notion.pages.update({ page_id: id, properties }),
    getExercisesMap(),
  ]);
  return sendJson(res, 200, { entry: normalizeEntry(page, exercisesMap) });
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
    console.error(`${req.method} /api/workout-log failed`, err);
    return sendJson(res, 500, { error: 'Failed to process workout log request' });
  }
};
