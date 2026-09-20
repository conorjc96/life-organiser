import React, { useEffect, useMemo, useState } from 'react';
import { getProjects, getTasks, getAreas, setTaskStatus, setTaskWhen, createTask } from '../api/notion';
import ScreenHeader from './ScreenHeader';
import AreaFilter from './AreaFilter';
import AnimatedCheckbox from './AnimatedCheckbox';
import './ProjectsScreen.css';

const STATUS_CLASS = {
  Complete: 'status-pill--complete',
  Active: 'status-pill--on-track',
  'In Progress': 'status-pill--in-progress',
  Starting: 'status-pill--not-started',
  Paused: 'status-pill--at-risk',
};

function ProjectsScreen() {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [areas, setAreas] = useState([]);
  const [state, setState] = useState('loading');
  const [selectedAreaId, setSelectedAreaId] = useState('all');
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [newTaskDrafts, setNewTaskDrafts] = useState({});
  const [creatingIds, setCreatingIds] = useState(() => new Set());
  // Open defaults to expanded, Completed defaults to collapsed — these Sets
  // track exceptions to that default, per project.
  const [openCollapsedIds, setOpenCollapsedIds] = useState(() => new Set());
  const [completedExpandedIds, setCompletedExpandedIds] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    Promise.all([getProjects(), getTasks(), getAreas()])
      .then(([projectList, taskList, areaList]) => {
        if (cancelled) return;
        setProjects(projectList);
        setTasks(taskList);
        setAreas(areaList);
        setState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load projects', err);
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleProjects = useMemo(() => {
    if (selectedAreaId === 'all') return projects;
    return projects.filter((p) => p.areaId === selectedAreaId);
  }, [projects, selectedAreaId]);

  const tasksByProject = useMemo(() => {
    const map = new Map();
    for (const task of tasks) {
      for (const projectId of task.projectIds) {
        if (!map.has(projectId)) map.set(projectId, []);
        map.get(projectId).push(task);
      }
    }
    return map;
  }, [tasks]);

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSet = (setter) => (id) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleOpenSection = toggleSet(setOpenCollapsedIds);
  const toggleCompletedSection = toggleSet(setCompletedExpandedIds);

  const toggleTaskDone = async (task) => {
    const newStatus = task.status === 'Done' ? 'To Do' : 'Done';
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    try {
      await setTaskStatus(task.id, newStatus);
    } catch (err) {
      console.error('Failed to update task status', err);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
    }
  };

  const setTaskWhenBucket = async (task, targetWhen) => {
    // Tapping the already-active bucket clears it back to Backlog, so both
    // buttons double as an on/off toggle rather than only ever landing on
    // "Today" (which used to be the only way in, with "This Week" reachable
    // only as an implicit revert).
    const newWhen = task.when === targetWhen ? 'Backlog' : targetWhen;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, when: newWhen } : t)));
    try {
      await setTaskWhen(task.id, newWhen);
    } catch (err) {
      console.error('Failed to update task when', err);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, when: task.when } : t)));
    }
  };

  const updateDraft = (projectId, value) => {
    setNewTaskDrafts((prev) => ({ ...prev, [projectId]: value }));
  };

  const submitNewTask = async (projectId) => {
    const name = (newTaskDrafts[projectId] || '').trim();
    if (!name || creatingIds.has(projectId)) return;

    setCreatingIds((prev) => new Set(prev).add(projectId));
    try {
      const task = await createTask({ name, projectId, when: 'Backlog' });
      setTasks((prev) => [...prev, task]);
      updateDraft(projectId, '');
    } catch (err) {
      console.error('Failed to create task', err);
    } finally {
      setCreatingIds((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  };

  return (
    <div className="projects-screen">
      <ScreenHeader
        eyebrow="🚀 Projects"
        title="What you're building"
        subtitle={`${projects.length || '···'} projects across 8 areas`}
      />

      <AreaFilter areas={areas} selectedAreaId={selectedAreaId} onChange={setSelectedAreaId} />

      <main className="projects-body">
        {state === 'loading' && <p className="section-status">Loading projects…</p>}
        {state === 'error' && (
          <p className="section-status section-status--error">
            Couldn't load projects from Notion.
          </p>
        )}
        {state === 'ready' && visibleProjects.length === 0 && (
          <p className="section-status">No projects in this area yet.</p>
        )}

        {state === 'ready' &&
          visibleProjects.map((project) => {
            const isExpanded = expandedIds.has(project.id);
            const projectTasks = tasksByProject.get(project.id) || [];
            const openTasks = projectTasks.filter((t) => t.status !== 'Done');
            const completedTasks = projectTasks.filter((t) => t.status === 'Done');
            // Derive counts from the already-fetched tasks list, not the
            // separately-fetched project's own doneTasks/percentComplete —
            // those come from a different request and never update when a
            // task is ticked here, so the progress bar looked frozen.
            const totalTasks = projectTasks.length;
            const doneTasks = completedTasks.length;
            const percentComplete = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
            const isOpenCollapsed = openCollapsedIds.has(project.id);
            const isCompletedExpanded = completedExpandedIds.has(project.id);

            const renderTaskRow = (task) => (
              <div key={task.id} className="project-task-row">
                <AnimatedCheckbox
                  checked={task.status === 'Done'}
                  onChange={() => toggleTaskDone(task)}
                  label={task.name}
                />
                <div className="when-toggle-group">
                  <button
                    type="button"
                    className={
                      task.when === 'This Week'
                        ? 'when-toggle when-toggle--week when-toggle--active'
                        : 'when-toggle when-toggle--week'
                    }
                    onClick={() => setTaskWhenBucket(task, 'This Week')}
                  >
                    Week
                  </button>
                  <button
                    type="button"
                    className={
                      task.when === 'Today' ? 'when-toggle when-toggle--active' : 'when-toggle'
                    }
                    onClick={() => setTaskWhenBucket(task, 'Today')}
                  >
                    Today
                  </button>
                </div>
              </div>
            );

            return (
              <div key={project.id} className="project-card">
                <button
                  type="button"
                  className="project-card-header"
                  onClick={() => toggleExpanded(project.id)}
                  aria-expanded={isExpanded}
                >
                  <div className="project-card-heading">
                    <p className="project-name">{project.name}</p>
                    <span
                      className={`status-pill ${STATUS_CLASS[project.status] || 'status-pill--not-started'}`}
                    >
                      {project.status || 'Starting'}
                    </span>
                  </div>
                  <div className="project-progress-row">
                    <div className="project-progress-track">
                      <div
                        className="project-progress-fill"
                        style={{ width: `${percentComplete}%` }}
                      />
                    </div>
                    <span className="project-progress-label">
                      {doneTasks}/{totalTasks}
                    </span>
                  </div>
                  <div className="project-meta">
                    {project.areaName && <span className="meta-pill">{project.areaName}</span>}
                  </div>
                  <span className={isExpanded ? 'project-chevron project-chevron--open' : 'project-chevron'} aria-hidden="true">
                    ›
                  </span>
                </button>

                {isExpanded && (
                  <div className="project-tasks">
                    {projectTasks.length === 0 && (
                      <p className="section-status project-tasks-empty">No tasks yet.</p>
                    )}

                    {projectTasks.length > 0 && (
                      <div className="task-subsection">
                        <button
                          type="button"
                          className="task-subsection-header"
                          onClick={() => toggleOpenSection(project.id)}
                          aria-expanded={!isOpenCollapsed}
                        >
                          <span>Open ({openTasks.length})</span>
                          <span
                            className={
                              isOpenCollapsed ? 'subsection-chevron' : 'subsection-chevron subsection-chevron--open'
                            }
                            aria-hidden="true"
                          >
                            ›
                          </span>
                        </button>
                        {!isOpenCollapsed && openTasks.map(renderTaskRow)}
                      </div>
                    )}

                    {projectTasks.length > 0 && (
                      <div className="task-subsection">
                        <button
                          type="button"
                          className="task-subsection-header"
                          onClick={() => toggleCompletedSection(project.id)}
                          aria-expanded={isCompletedExpanded}
                        >
                          <span>Completed ({completedTasks.length})</span>
                          <span
                            className={
                              isCompletedExpanded ? 'subsection-chevron subsection-chevron--open' : 'subsection-chevron'
                            }
                            aria-hidden="true"
                          >
                            ›
                          </span>
                        </button>
                        {isCompletedExpanded && completedTasks.map(renderTaskRow)}
                      </div>
                    )}

                    <div className="add-task-row">
                      <input
                        type="text"
                        className="add-task-input"
                        placeholder="Add a task…"
                        value={newTaskDrafts[project.id] || ''}
                        onChange={(e) => updateDraft(project.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitNewTask(project.id);
                        }}
                      />
                      <button
                        type="button"
                        className="add-task-button"
                        disabled={!(newTaskDrafts[project.id] || '').trim() || creatingIds.has(project.id)}
                        onClick={() => submitNewTask(project.id)}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </main>
    </div>
  );
}

export default ProjectsScreen;
