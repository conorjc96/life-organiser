import React, { useEffect, useMemo, useState } from 'react';
import {
  getWorkoutLog,
  getExercises,
  createWorkoutEntry,
  updateWorkoutEntry,
  deleteWorkoutEntry,
} from '../api/notion';
import { todayDateString } from '../utils/schedule';
import ScreenHeader from './ScreenHeader';
import FoodScreen from './FoodScreen';
import './WorkoutScreen.css';

function formatDateLabel(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = todayDateString();
  const yesterday = (() => {
    const t = new Date();
    t.setDate(t.getDate() - 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  })();
  if (dateString === today) return 'Today';
  if (dateString === yesterday) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function emptyDraft() {
  return { exerciseName: '', date: todayDateString(), weight: '', reps: '', sets: '' };
}

// "60kg × 8 × 3 sets" — omits whichever fields weren't logged, rather than
// showing "null" or empty gaps.
function formatStats(entry) {
  const parts = [];
  if (entry.weight != null) parts.push(`${entry.weight}kg`);
  if (entry.reps != null) parts.push(`× ${entry.reps}`);
  if (entry.sets != null) parts.push(`× ${entry.sets} sets`);
  return parts.join(' ');
}

function WorkoutScreen() {
  const [view, setView] = useState('workouts'); // 'workouts' | 'food'
  const [entries, setEntries] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [state, setState] = useState('loading');
  const [exerciseFilter, setExerciseFilter] = useState('all');
  const [draft, setDraft] = useState(emptyDraft);
  const [logging, setLogging] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([getWorkoutLog({ signal }), getExercises({ signal })])
      .then(([entryList, exerciseList]) => {
        setEntries(entryList);
        setExercises(exerciseList);
        setState('ready');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to load workout log', err);
        setState('error');
      });
    return () => controller.abort();
  }, []);

  const visibleEntries = useMemo(() => {
    if (exerciseFilter === 'all') return entries;
    return entries.filter((e) => e.exerciseId === exerciseFilter);
  }, [entries, exerciseFilter]);

  // Entries already come back sorted by Date desc from the API — grouping
  // preserves that order, giving a "today's workout / yesterday's / ..."
  // session view. Filtering to one exercise turns the same grouping into a
  // progression view (each date shows what you lifted that session).
  const groupedByDate = useMemo(() => {
    const map = new Map();
    for (const entry of visibleEntries) {
      if (!entry.date) continue;
      if (!map.has(entry.date)) map.set(entry.date, []);
      map.get(entry.date).push(entry);
    }
    return [...map.entries()];
  }, [visibleEntries]);

  const submitEntry = async () => {
    const exerciseName = draft.exerciseName.trim();
    if (!exerciseName || !draft.date || logging) return;
    setLogging(true);
    try {
      const entry = await createWorkoutEntry({
        exerciseName,
        date: draft.date,
        weight: draft.weight,
        reps: draft.reps,
        sets: draft.sets,
      });
      setEntries((prev) => [entry, ...prev]);
      if (!exercises.some((e) => e.name.toLowerCase() === exerciseName.toLowerCase())) {
        setExercises((prev) => [...prev, { id: entry.exerciseId, name: entry.exerciseName, category: null }]);
      }
      // Keep the date, clear the rest — logging a full session means
      // repeating this for each exercise without re-picking the date.
      setDraft((d) => ({ ...emptyDraft(), date: d.date }));
    } catch (err) {
      console.error('Failed to log workout entry', err);
    } finally {
      setLogging(false);
    }
  };

  const startEdit = (entry) => {
    setEditingId(entry.id);
    setEditDraft({
      weight: entry.weight ?? '',
      reps: entry.reps ?? '',
      sets: entry.sets ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const saveEdit = async (id) => {
    try {
      const updated = await updateWorkoutEntry({ id, ...editDraft });
      setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
      cancelEdit();
    } catch (err) {
      console.error('Failed to update workout entry', err);
    }
  };

  const removeEntry = async (id) => {
    if (!window.confirm("Delete this entry? This can't be undone from here.")) return;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    try {
      await deleteWorkoutEntry(id);
    } catch (err) {
      console.error('Failed to delete workout entry', err);
    }
  };

  return (
    <div className="workout-screen">
      <ScreenHeader
        eyebrow={view === 'workouts' ? '🏋️ Workout' : '🍽️ Food'}
        title={view === 'workouts' ? 'Track your lifts' : 'Track what you eat'}
        subtitle={
          view === 'workouts'
            ? `${entries.length || '···'} logged sessions`
            : '140-150g protein a day'
        }
      />

      <div className="workout-view-toggle">
        <button
          type="button"
          className={view === 'workouts' ? 'workout-view-tab workout-view-tab--active' : 'workout-view-tab'}
          onClick={() => setView('workouts')}
        >
          🏋️ Workouts
        </button>
        <button
          type="button"
          className={view === 'food' ? 'workout-view-tab workout-view-tab--active' : 'workout-view-tab'}
          onClick={() => setView('food')}
        >
          🍽️ Food
        </button>
      </div>

      <main className="workout-body">
        {view === 'food' && <FoodScreen />}
        {view === 'workouts' && (
        <>
        <div className="workout-log-form">
          <div className="workout-log-row">
            <input
              type="text"
              className="add-task-input"
              placeholder="Exercise (e.g. Bench Press)…"
              list="exercise-suggestions"
              value={draft.exerciseName}
              onChange={(e) => setDraft((d) => ({ ...d, exerciseName: e.target.value }))}
            />
            <input
              type="date"
              className="workout-date-input"
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
            />
          </div>
          <datalist id="exercise-suggestions">
            {exercises.map((e) => (
              <option key={e.id} value={e.name} />
            ))}
          </datalist>
          <div className="workout-log-row">
            <input
              type="number"
              className="workout-number-input"
              placeholder="Weight"
              value={draft.weight}
              onChange={(e) => setDraft((d) => ({ ...d, weight: e.target.value }))}
            />
            <input
              type="number"
              className="workout-number-input"
              placeholder="Reps"
              value={draft.reps}
              onChange={(e) => setDraft((d) => ({ ...d, reps: e.target.value }))}
            />
            <input
              type="number"
              className="workout-number-input"
              placeholder="Sets"
              value={draft.sets}
              onChange={(e) => setDraft((d) => ({ ...d, sets: e.target.value }))}
            />
            <button
              type="button"
              className="add-task-button"
              disabled={!draft.exerciseName.trim() || logging}
              onClick={submitEntry}
            >
              {logging ? 'Logging…' : 'Log'}
            </button>
          </div>
        </div>

        <div className="area-filter">
          <div className="area-filter-inner">
            <button
              type="button"
              className={exerciseFilter === 'all' ? 'area-chip area-chip--active' : 'area-chip'}
              onClick={() => setExerciseFilter('all')}
            >
              All
            </button>
            {exercises.map((e) => (
              <button
                key={e.id}
                type="button"
                className={exerciseFilter === e.id ? 'area-chip area-chip--active' : 'area-chip'}
                onClick={() => setExerciseFilter(e.id)}
              >
                {e.name}
              </button>
            ))}
          </div>
        </div>

        {state === 'loading' && <p className="section-status">Loading your workout log…</p>}
        {state === 'error' && (
          <p className="section-status section-status--error">
            Couldn't load the workout log from Notion.
          </p>
        )}
        {state === 'ready' && groupedByDate.length === 0 && (
          <p className="section-status">Nothing logged yet — add your first set above.</p>
        )}

        {state === 'ready' &&
          groupedByDate.map(([date, dateEntries]) => (
            <section key={date} className="workout-date-group">
              <h2 className="workout-date-title">{formatDateLabel(date)}</h2>
              <ul className="workout-entry-list">
                {dateEntries.map((entry) => {
                  const isEditing = editingId === entry.id;
                  return (
                    <li key={entry.id} className="workout-entry">
                      {isEditing ? (
                        <div className="workout-edit-row">
                          <span className="workout-entry-name">{entry.exerciseName}</span>
                          <input
                            type="number"
                            className="workout-number-input"
                            placeholder="Weight"
                            value={editDraft.weight}
                            onChange={(e) => setEditDraft((d) => ({ ...d, weight: e.target.value }))}
                          />
                          <input
                            type="number"
                            className="workout-number-input"
                            placeholder="Reps"
                            value={editDraft.reps}
                            onChange={(e) => setEditDraft((d) => ({ ...d, reps: e.target.value }))}
                          />
                          <input
                            type="number"
                            className="workout-number-input"
                            placeholder="Sets"
                            value={editDraft.sets}
                            onChange={(e) => setEditDraft((d) => ({ ...d, sets: e.target.value }))}
                          />
                          <button type="button" className="workout-save-btn" onClick={() => saveEdit(entry.id)}>
                            Save
                          </button>
                          <button type="button" className="workout-cancel-btn" onClick={cancelEdit}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button type="button" className="workout-entry-row" onClick={() => startEdit(entry)}>
                          <span className="workout-entry-name">{entry.exerciseName}</span>
                          <span className="workout-entry-stats">{formatStats(entry)}</span>
                        </button>
                      )}
                      {!isEditing && (
                        <button
                          type="button"
                          className="workout-delete-btn"
                          aria-label="Delete entry"
                          onClick={() => removeEntry(entry.id)}
                        >
                          ×
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
        )}
      </main>
    </div>
  );
}

export default WorkoutScreen;
