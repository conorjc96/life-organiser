async function getJson(path) {
  const res = await fetch(path);
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

export async function getAreas() {
  const { areas } = await getJson('/api/areas');
  return areas;
}

export async function getGoals(timeframe) {
  const query = timeframe ? `?timeframe=${encodeURIComponent(timeframe)}` : '';
  const { goals } = await getJson(`/api/goals${query}`);
  return goals;
}

export async function getActivities(areaId) {
  const query = areaId ? `?areaId=${encodeURIComponent(areaId)}` : '';
  const { activities } = await getJson(`/api/activities${query}`);
  return activities;
}

export async function getProjects(areaId) {
  const query = areaId ? `?areaId=${encodeURIComponent(areaId)}` : '';
  const { projects } = await getJson(`/api/projects${query}`);
  return projects;
}

export async function getTasks({ when, projectId } = {}) {
  const params = new URLSearchParams();
  if (when) params.set('when', when);
  if (projectId) params.set('projectId', projectId);
  const query = params.toString() ? `?${params.toString()}` : '';
  const { tasks } = await getJson(`/api/tasks${query}`);
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
