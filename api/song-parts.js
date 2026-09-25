const { notion, DATA_SOURCES, queryAll, sendJson } = require('./_lib/notion');
const { getProjectsMap } = require('./_lib/projects');
const { getTitle, getSelect, getUrl, getCheckbox, getRelationIds } = require('./_lib/notion-utils');

const VALID_SONG_PART = [
  'Verse',
  'Chorus',
  'Bridge',
  'Hook',
  'Vocals',
  'Instrumental',
  'Riff',
  'Full Song',
];

function normalizeSongPart(page, projectsMap) {
  const props = page.properties;
  const projectIds = getRelationIds(props.Project);
  const project = projectsMap.get(projectIds[0]) || null;
  return {
    id: page.id,
    name: getTitle(props.Part),
    songPart: getSelect(props['Song Part']),
    link: getUrl(props['BandLab Link']),
    used: getCheckbox(props.Used),
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    projectIcon: project?.icon ?? null,
  };
}

function buildFilter(songPart, used) {
  const conditions = [];
  if (songPart) conditions.push({ property: 'Song Part', select: { equals: songPart } });
  if (used !== undefined) conditions.push({ property: 'Used', checkbox: { equals: used === 'true' } });
  if (conditions.length === 0) return {};
  if (conditions.length === 1) return { filter: conditions[0] };
  return { filter: { and: conditions } };
}

async function handleGet(req, res) {
  const { songPart, used } = req.query;
  if (songPart && !VALID_SONG_PART.includes(songPart)) {
    return sendJson(res, 400, { error: `songPart must be one of ${VALID_SONG_PART.join(', ')}` });
  }
  const [pages, projectsMap] = await Promise.all([
    queryAll(DATA_SOURCES.songParts, buildFilter(songPart, used)),
    getProjectsMap(),
  ]);
  const songParts = pages.map((page) => normalizeSongPart(page, projectsMap));
  return sendJson(res, 200, { songParts });
}

async function handlePost(req, res) {
  const { name, songPart, link, projectId } = req.body || {};
  if (!name || !name.trim()) {
    return sendJson(res, 400, { error: 'name is required' });
  }
  if (songPart !== undefined && songPart && !VALID_SONG_PART.includes(songPart)) {
    return sendJson(res, 400, { error: `songPart must be one of ${VALID_SONG_PART.join(', ')}` });
  }

  const properties = {
    Part: { title: [{ text: { content: name.trim() } }] },
    Used: { checkbox: false },
  };
  if (songPart) properties['Song Part'] = { select: { name: songPart } };
  if (link) properties['BandLab Link'] = { url: link.trim() };
  if (projectId) properties.Project = { relation: [{ id: projectId }] };

  const [page, projectsMap] = await Promise.all([
    notion.pages.create({
      parent: { type: 'data_source_id', data_source_id: DATA_SOURCES.songParts },
      properties,
    }),
    getProjectsMap(),
  ]);
  return sendJson(res, 201, { songPart: normalizeSongPart(page, projectsMap) });
}

async function handlePatch(req, res) {
  const { id, name, songPart, link, projectId, used } = req.body || {};
  if (!id) {
    return sendJson(res, 400, { error: 'id is required' });
  }
  const noFieldsGiven = [name, songPart, link, projectId, used].every((v) => v === undefined);
  if (noFieldsGiven) {
    return sendJson(res, 400, { error: 'at least one field to update is required' });
  }
  if (name !== undefined && !name.trim()) {
    return sendJson(res, 400, { error: 'name cannot be empty' });
  }
  if (songPart && !VALID_SONG_PART.includes(songPart)) {
    return sendJson(res, 400, { error: `songPart must be one of ${VALID_SONG_PART.join(', ')}` });
  }

  const properties = {};
  if (name !== undefined) properties.Part = { title: [{ text: { content: name.trim() } }] };
  if (songPart !== undefined) properties['Song Part'] = { select: songPart ? { name: songPart } : null };
  if (link !== undefined) properties['BandLab Link'] = { url: link ? link.trim() : null };
  if (projectId !== undefined) properties.Project = { relation: projectId ? [{ id: projectId }] : [] };
  if (used !== undefined) properties.Used = { checkbox: Boolean(used) };

  const [page, projectsMap] = await Promise.all([
    notion.pages.update({ page_id: id, properties }),
    getProjectsMap(),
  ]);
  return sendJson(res, 200, { songPart: normalizeSongPart(page, projectsMap) });
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
    console.error(`${req.method} /api/song-parts failed`, err);
    return sendJson(res, 500, { error: 'Failed to process song parts request' });
  }
};
