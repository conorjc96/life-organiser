import React, { useEffect, useMemo, useState } from 'react';
import { getProjects, getTasks, getAreas, setTaskStatus, setTaskWhen } from '../api/notion';
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

  const toggleTaskToday = async (task) => {
    const isToday = task.when === 'Today';
    const newWhen = isToday ? 'This Week' : 'Today';
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, when: newWhen } : t)));
    try {
      await setTaskWhen(task.id, newWhen);
    } catch (err) {
      console.error('Failed to update task when', err);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, when: task.when } : t)));
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
                        style={{ width: `${project.percentComplete}%` }}
                      />
                    </div>
                    <span className="project-progress-label">
                      {project.doneTasks}/{project.totalTasks}
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
                    {projectTasks.map((task) => (
                      <div key={task.id} className="project-task-row">
                        <AnimatedCheckbox
                          checked={task.status === 'Done'}
                          onChange={() => toggleTaskDone(task)}
                          label={task.name}
                        />
                        <button
                          type="button"
                          className={
                            task.when === 'Today'
                              ? 'today-toggle today-toggle--active'
                              : 'today-toggle'
                          }
                          onClick={() => toggleTaskToday(task)}
                        >
                          {task.when === 'Today' ? '✓ Today' : '+ Today'}
                        </button>
                      </div>
                    ))}
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
