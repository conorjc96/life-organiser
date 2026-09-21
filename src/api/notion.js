async function getJson(path, { signal } = {}) {
  const res = await fetch(path, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request to ${path} failed with ${res.status}`);
  }
  return res.json();
}

async function patchJson(path, payload) {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `PATCH ${path} failed with ${res.status}`);
  }
  return res.json();
}

async function postJson(path, payload) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST ${path} failed with ${res.status}`);
  }
  return res.json();
}

async function deleteJson(path) {
  const res = await fetch(path, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `DELETE ${path} failed with ${res.status}`);
  }
  return res.json();
}

export async function getAreas({ signal } = {}) {
  const { areas } = await getJson('/api/areas', { signal });
  return areas;
}

export async function getGoals(timeframe, { signal } = {}) {
  const query = timeframe ? `?timeframe=${encodeURIComponent(timeframe)}` : '';
  const { goals } = await getJson(`/api/goals${query}`, { signal });
  return goals;
}

export async function getActivities(areaId, { signal } = {}) {
  const query = areaId ? `?areaId=${encodeURIComponent(areaId)}` : '';
  const { activities } = await getJson(`/api/activities${query}`, { signal });
  return activities;
}

export async function getProjects(areaId, { signal } = {}) {
  const query = areaId ? `?areaId=${encodeURIComponent(areaId)}` : '';
  const { projects } = await getJson(`/api/projects${query}`, { signal });
  return projects;
}

export async function getTasks({ when, projectId, signal } = {}) {
  const params = new URLSearchParams();
  if (when) params.set('when', when);
  if (projectId) params.set('projectId', projectId);
  const query = params.toString() ? `?${params.toString()}` : '';
  const { tasks } = await getJson(`/api/tasks${query}`, { signal });
  return tasks;
}

export async function setActivityLastDone(id, lastDone) {
  const { activity } = await patchJson('/api/activities', { id, lastDone });
  return activity;
}

export async function setTaskStatus(id, status) {
  const { task } = await patchJson('/api/tasks', { id, status });
  return task;
}

export async function setTaskWhen(id, when) {
  const { task } = await patchJson('/api/tasks', { id, when });
  return task;
}

export async function createTask({ name, projectId, when }) {
  const { task } = await postJson('/api/tasks', { name, projectId, when });
  return task;
}

export async function createGoal({ name, areaId, timeframe }) {
  const { goal } = await postJson('/api/goals', { name, areaId, timeframe });
  return goal;
}

export async function setGoalTimeframe(id, timeframe) {
  const { goal } = await patchJson('/api/goals', { id, timeframe });
  return goal;
}

export async function getLifeWheel(month, { signal } = {}) {
  const { ratings } = await getJson(`/api/life-wheel?month=${encodeURIComponent(month)}`, { signal });
  return ratings;
}

export async function setLifeWheelScore(month, areaId, score) {
  const { rating } = await patchJson('/api/life-wheel', { month, areaId, score });
  return rating;
}

export async function getSchedule(date, { signal } = {}) {
  const { blocks } = await getJson(`/api/schedule?date=${encodeURIComponent(date)}`, { signal });
  return blocks;
}

export async function createScheduleBlock({ name, start, end, areaId, source }) {
  const { block } = await postJson('/api/schedule', { name, start, end, areaId, source });
  return block;
}

export async function updateScheduleBlock({ id, name, start, end, areaId }) {
  const { block } = await patchJson('/api/schedule', { id, name, start, end, areaId });
  return block;
}

export async function deleteScheduleBlock(id) {
  return deleteJson(`/api/schedule?id=${encodeURIComponent(id)}`);
}
