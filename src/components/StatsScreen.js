import React, { useEffect, useMemo, useState } from 'react';
import { getAreas, getActivities, getProjects, getTasks } from '../api/notion';
import { formatLastDone, daysSince } from '../utils/date';
import ScreenHeader from './ScreenHeader';
import './StatsScreen.css';

const NEGLECTED_THRESHOLD_DAYS = 30;

// Engagement per area = completed Tasks (via their Project's Area — a real
// cumulative count, since each Task is a one-off item) + Activities marked
// done (via their own Area). No duration weighting: Tasks don't have a
// duration field at all, so mixing "activity-minutes" with "task count"
// on one scale would be meaningless. Simple counts are the honest measure.
function computeAreaStats(areas, activities, tasks, projectsById) {
  const stats = new Map(
    areas.map((area) => [area.id, { area, completedActivities: 0, completedTasks: 0 }])
  );

  for (const activity of activities) {
    if (!activity.areaId || !activity.lastDone) continue;
    const entry = stats.get(activity.areaId);
    if (entry) entry.completedActivities += 1;
  }

  for (const task of tasks) {
    if (task.status !== 'Done') continue;
    const project = projectsById.get(task.projectIds[0]);
    if (!project?.areaId) continue;
    const entry = stats.get(project.areaId);
    if (entry) entry.completedTasks += 1;
  }

  return [...stats.values()]
    .map((entry) => ({ ...entry, total: entry.completedActivities + entry.completedTasks }))
    .sort((a, b) => b.total - a.total);
}

// Same activities-by-area data, but ranked the other way — longest since
// any activity in that area was last done. Independent of the count above:
// an area can be "frequently touched" and still currently neglected, or
// vice versa.
function computeNeglectedAreas(areas, activities) {
  const latestByArea = new Map();
  for (const activity of activities) {
    if (!activity.areaId || !activity.lastDone) continue;
    const current = latestByArea.get(activity.areaId);
    if (!current || activity.lastDone > current) {
      latestByArea.set(activity.areaId, activity.lastDone);
    }
  }
  return areas
    .map((area) => {
      const lastDone = latestByArea.get(area.id) || null;
      return { ...area, lastDone, neglectDays: daysSince(lastDone) };
    })
    .sort((a, b) => b.neglectDays - a.neglectDays);
}

function computeProjectStats(projects, tasks) {
  const tasksByProject = new Map();
  for (const task of tasks) {
    for (const projectId of task.projectIds) {
      if (!tasksByProject.has(projectId)) tasksByProject.set(projectId, []);
      tasksByProject.get(projectId).push(task);
    }
  }

  return projects
    .map((project) => {
      const projectTasks = tasksByProject.get(project.id) || [];
      const doneCount = projectTasks.filter((t) => t.status === 'Done').length;
      const lastTouched = projectTasks.reduce((latest, t) => {
        if (!t.lastEditedTime) return latest;
        return !latest || t.lastEditedTime > latest ? t.lastEditedTime : latest;
      }, null);
      return {
        ...project,
        totalTasks: projectTasks.length,
        doneTasks: doneCount,
        lastTouched,
        neglectDays: daysSince(lastTouched),
      };
    })
    .sort((a, b) => a.neglectDays - b.neglectDays);
}

function StatsScreen({ onOpenLifeWheel }) {
  const [areas, setAreas] = useState([]);
  const [areaStats, setAreaStats] = useState([]);
  const [neglectedAreas, setNeglectedAreas] = useState([]);
  const [projectStats, setProjectStats] = useState([]);
  const [state, setState] = useState('loading');

  useEffect(() => {
    // A plain "cancelled" boolean only suppresses the stale setState — it
    // doesn't stop the underlying request. If you navigate away before it
    // resolves, the fetch keeps running and holds a connection open; enough
    // of those piling up (this screen alone fires 4 concurrent requests)
    // can exhaust the browser's per-origin connection limit and make an
    // unrelated screen's fresh requests appear to hang. Aborting on
    // cleanup actually cancels the request.
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      getAreas({ signal }),
      getActivities(undefined, { signal }),
      getProjects(undefined, { signal }),
      getTasks({ signal }),
    ])
      .then(([areaList, activityList, projectList, taskList]) => {
        const projectsById = new Map(projectList.map((p) => [p.id, p]));
        setAreas(areaList);
        setAreaStats(computeAreaStats(areaList, activityList, taskList, projectsById));
        setNeglectedAreas(computeNeglectedAreas(areaList, activityList));
        setProjectStats(computeProjectStats(projectList, taskList));
        setState('ready');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to load stats', err);
        setState('error');
      });
    return () => {
      controller.abort();
    };
  }, []);

  const maxTotal = useMemo(
    () => Math.max(1, ...areaStats.map((a) => a.total)),
    [areaStats]
  );

  return (
    <div className="stats-screen">
      <ScreenHeader
        eyebrow="📊 Stats"
        title="Where your effort's gone"
        subtitle={`${areas.length || '···'} areas, tracked by completed tasks and activities`}
      />

      <main className="stats-body">
        <button type="button" className="card life-wheel-link" onClick={onOpenLifeWheel}>
          <div className="life-wheel-link-text">
            <span className="section-icon" aria-hidden="true">🎡</span>
            <div>
              <p className="life-wheel-link-title">Life Wheel</p>
              <p className="life-wheel-link-subtitle">Rate this month across all 8 areas</p>
            </div>
          </div>
          <span className="life-wheel-link-arrow" aria-hidden="true">›</span>
        </button>

        {state === 'loading' && <p className="section-status">Loading stats…</p>}
        {state === 'error' && (
          <p className="section-status section-status--error">
            Couldn't load stats from Notion.
          </p>
        )}

        {state === 'ready' && (
          <>
            <section className="card">
              <div className="section-header">
                <span className="section-icon" aria-hidden="true">📈</span>
                <h2 className="section-title">By Area</h2>
              </div>
              <div className="chart-legend">
                <span className="legend-item">
                  <span className="legend-swatch legend-swatch--tasks" /> Tasks completed
                </span>
                <span className="legend-item">
                  <span className="legend-swatch legend-swatch--activities" /> Activities done
                </span>
              </div>
              <div className="bar-list">
                {areaStats.map((entry) => (
                  <div key={entry.area.id} className="bar-row">
                    <div className="bar-row-label">
                      <span aria-hidden="true">{entry.area.icon}</span> {entry.area.name}
                    </div>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ width: `${(entry.total / maxTotal) * 100}%` }}
                      >
                        {entry.completedTasks > 0 && (
                          <div
                            className="bar-segment bar-segment--tasks"
                            style={{ flexGrow: entry.completedTasks }}
                            title={`Tasks completed: ${entry.completedTasks}`}
                          />
                        )}
                        {entry.completedActivities > 0 && (
                          <div
                            className="bar-segment bar-segment--activities"
                            style={{ flexGrow: entry.completedActivities }}
                            title={`Activities done: ${entry.completedActivities}`}
                          />
                        )}
                      </div>
                    </div>
                    <span className="bar-total">{entry.total}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card">
              <div className="section-header">
                <span className="section-icon" aria-hidden="true">🧭</span>
                <h2 className="section-title">Neglected Areas</h2>
              </div>
              <ul className="neglect-list">
                {neglectedAreas.map((area) => {
                  const stale = area.neglectDays >= NEGLECTED_THRESHOLD_DAYS;
                  return (
                    <li key={area.id} className="neglect-item">
                      <span className="neglect-icon" aria-hidden="true">{area.icon}</span>
                      <span className="neglect-name">{area.name}</span>
                      <span className={stale ? 'meta-pill meta-pill--stale' : 'meta-pill'}>
                        {formatLastDone(area.lastDone)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="card">
              <div className="section-header">
                <span className="section-icon" aria-hidden="true">🚀</span>
                <h2 className="section-title">Projects</h2>
              </div>
              {projectStats.length === 0 && (
                <p className="section-status">No projects yet.</p>
              )}
              <ul className="neglect-list">
                {projectStats.map((project) => {
                  const stale = project.neglectDays >= NEGLECTED_THRESHOLD_DAYS;
                  return (
                    <li key={project.id} className="neglect-item">
                      {project.icon && (
                        <span className="neglect-icon" aria-hidden="true">{project.icon}</span>
                      )}
                      <span className="neglect-name">
                        {project.name}
                        <span className="neglect-sub"> · {project.doneTasks}/{project.totalTasks} tasks</span>
                      </span>
                      <span className={stale ? 'meta-pill meta-pill--stale' : 'meta-pill'}>
                        {project.totalTasks === 0 ? 'No tasks' : formatLastDone(project.lastTouched)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default StatsScreen;
