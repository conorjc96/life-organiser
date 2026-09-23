import React, { useState } from 'react';
import { updateTask, deleteTask } from '../api/notion';
import './TaskDetailModal.css';

const STATUS_OPTIONS = ['To Do', 'In Progress', 'Done', 'Cancelled'];
const WHEN_OPTIONS = ['Today', 'This Week', 'Backlog'];
const PRIORITY_OPTIONS = ['', 'Low', 'Medium', 'High'];

// Shared across every screen that renders a task (Home's Daily Plan/This
// Week/Backlog, Projects' task rows) — clicking a task's name opens this
// with every relevant Notion field editable, rather than each screen
// growing its own bespoke edit UI.
function TaskDetailModal({ task, projects, areas, onClose, onSaved, onDeleted }) {
  const initialProjectId = task.projectIds?.[0] || '';
  const initialProject = projects.find((p) => p.id === initialProjectId);
  const [draft, setDraft] = useState({
    name: task.name,
    status: task.status || 'To Do',
    when: task.when || 'Backlog',
    priority: task.priority || '',
    due: task.due ? task.due.slice(0, 10) : '',
    // A task's Area follows its Project's Area whenever one is set (see
    // handleProjectChange) — so on open, trust the project's current area
    // over whatever was last saved on the task itself, in case they've
    // drifted (e.g. the project's area changed since).
    area: initialProjectId ? initialProject?.areaName || '' : task.area || '',
    projectId: initialProjectId,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Locking Area to the project's area while one is selected is
  // deliberate — the user asked for this specifically to keep a task's
  // area consistent with its project's, not just as a default.
  const handleProjectChange = (projectId) => {
    const project = projects.find((p) => p.id === projectId);
    setDraft((d) => ({
      ...d,
      projectId,
      area: projectId ? project?.areaName || '' : d.area,
    }));
  };

  const save = async () => {
    const name = draft.name.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      const updated = await updateTask({
        id: task.id,
        name,
        status: draft.status,
        when: draft.when,
        priority: draft.priority,
        due: draft.due || '',
        area: draft.area,
        projectId: draft.projectId,
      });
      onSaved(updated);
    } catch (err) {
      console.error('Failed to save task', err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (deleting) return;
    if (!window.confirm(`Delete "${task.name}"? This can't be undone from here.`)) return;
    setDeleting(true);
    try {
      await deleteTask(task.id);
      onDeleted(task.id);
    } catch (err) {
      console.error('Failed to delete task', err);
      setDeleting(false);
    }
  };

  return (
    <div className="task-detail-overlay" onClick={onClose}>
      <div className="task-detail-modal" onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          className="task-detail-name-input"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          autoFocus
        />

        <div className="task-detail-row">
          <label className="task-detail-field">
            <span>Status</span>
            <select
              value={draft.status}
              onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="task-detail-field">
            <span>When</span>
            <select
              value={draft.when}
              onChange={(e) => setDraft((d) => ({ ...d, when: e.target.value }))}
            >
              {WHEN_OPTIONS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="task-detail-row">
          <label className="task-detail-field">
            <span>Priority</span>
            <select
              value={draft.priority}
              onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p || 'none'} value={p}>
                  {p || 'None'}
                </option>
              ))}
            </select>
          </label>
          <label className="task-detail-field">
            <span>Due</span>
            <input
              type="date"
              value={draft.due}
              onChange={(e) => setDraft((d) => ({ ...d, due: e.target.value }))}
            />
          </label>
        </div>

        <div className="task-detail-row">
          <label className="task-detail-field task-detail-field--full">
            <span>Project</span>
            <select value={draft.projectId} onChange={(e) => handleProjectChange(e.target.value)}>
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon ? `${p.icon} ` : ''}
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="task-detail-field task-detail-field--full">
          <span>
            Area
            {draft.projectId && <span className="task-detail-hint"> · matches project</span>}
          </span>
          <select
            value={draft.area}
            disabled={Boolean(draft.projectId)}
            onChange={(e) => setDraft((d) => ({ ...d, area: e.target.value }))}
          >
            <option value="">No area</option>
            {/* Tasks' Area field predates the Areas database and isn't a
                relation to it — older tasks may hold a value (e.g. "Work")
                that isn't one of the 8 canonical area names. Keep it as its
                own option rather than silently discarding it on save. */}
            {draft.area && !areas.some((a) => a.name === draft.area) && (
              <option value={draft.area}>{draft.area} (legacy value)</option>
            )}
            {areas.map((a) => (
              <option key={a.id} value={a.name}>
                {a.icon ? `${a.icon} ` : ''}
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <div className="task-detail-actions">
          <button
            type="button"
            className="task-detail-delete"
            disabled={deleting}
            onClick={remove}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <div className="task-detail-actions-right">
            <button type="button" className="task-detail-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="task-detail-save"
              disabled={!draft.name.trim() || saving}
              onClick={save}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TaskDetailModal;
