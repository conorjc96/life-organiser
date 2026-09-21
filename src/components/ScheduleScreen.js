import React, { useEffect, useMemo, useState } from 'react';
import {
  getSchedule,
  createScheduleBlock,
  updateScheduleBlock,
  deleteScheduleBlock,
  getAreas,
  getActivities,
} from '../api/notion';
import {
  todayDateString,
  addDays,
  formatDayLabel,
  formatShortDayLabel,
  timePart,
  buildIso,
  minutesSinceMidnight,
  minutesToTimeString,
  formatTimeLabel,
} from '../utils/schedule';
import { generateScheduleSuggestions } from '../utils/scheduleSuggestions';
import ScreenHeader from './ScreenHeader';
import './ScheduleScreen.css';

const KIND_ICON = { activity: '📚' };

const PX_PER_MIN = 1;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DEFAULT_DURATION_MINUTES = 60;
const NEW_BLOCK_SNAP_MINUTES = 30; // clicking an empty slot snaps to the half-hour
const DRAG_SNAP_MINUTES = 15; // dragging an existing block snaps to the quarter-hour
const DRAG_THRESHOLD_PX = 6; // below this, a pointerdown+up is a tap (edit), not a drag

const emptyDraft = { name: '', start: '09:00', end: '10:00', areaId: '' };

function ScheduleScreen() {
  const [anchorDate, setAnchorDate] = useState(todayDateString);
  const [viewMode, setViewMode] = useState('day'); // 'day' | '3day'
  const [blocksByDate, setBlocksByDate] = useState({}); // { [dateStr]: Block[] }
  const [areas, setAreas] = useState([]);
  const [state, setState] = useState('loading');
  const [editingId, setEditingId] = useState(null); // null = closed, 'new' = adding, or a block id
  const [editingDate, setEditingDate] = useState(null); // which day's bucket the form is for
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  // { id, date, pointerId, startClientY, initialTop, currentTop, height, moved }
  const [dragState, setDragState] = useState(null);
  const [suggestState, setSuggestState] = useState('idle'); // idle | loading | reviewing
  const [suggestions, setSuggestions] = useState([]); // each: { ...candidate, included: boolean }
  const [suggestSaving, setSuggestSaving] = useState(false);

  const visibleDates = useMemo(
    () => (viewMode === '3day' ? [0, 1, 2] : [0]).map((n) => addDays(anchorDate, n)),
    [anchorDate, viewMode]
  );

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setState('loading');
    Promise.all([
      Promise.all(visibleDates.map((d) => getSchedule(d, { signal }))),
      getAreas({ signal }),
    ])
      .then(([blockLists, areaList]) => {
        const map = {};
        visibleDates.forEach((d, i) => {
          map[d] = blockLists[i];
        });
        setBlocksByDate(map);
        setAreas(areaList);
        setState('ready');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to load schedule', err);
        setState('error');
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorDate, viewMode]);

  const step = viewMode === '3day' ? 3 : 1;

  const openAddAt = (dateStr, startTime) => {
    const endTime = minutesToTimeString(minutesSinceMidnight(startTime) + DEFAULT_DURATION_MINUTES);
    setDraft({ name: '', start: startTime, end: endTime, areaId: '' });
    setEditingDate(dateStr);
    setEditingId('new');
  };

  const openEdit = (block, dateStr) => {
    setDraft({
      name: block.name,
      start: timePart(block.start),
      end: timePart(block.end),
      areaId: block.areaId || '',
    });
    setEditingDate(dateStr);
    setEditingId(block.id);
  };

  const closeForm = () => {
    setEditingId(null);
    setEditingDate(null);
  };

  // Clicking empty timeline space opens the add form pre-filled with the
  // time you clicked (snapped to the half hour) — blocks stop propagation
  // on their own pointer handlers, so this only fires for genuinely empty
  // space, never as a side effect of tapping a block.
  const handleTimelineClick = (e, dateStr) => {
    if (dragState) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const rawMinutes = offsetY / PX_PER_MIN;
    const snapped = Math.round(rawMinutes / NEW_BLOCK_SNAP_MINUTES) * NEW_BLOCK_SNAP_MINUTES;
    openAddAt(dateStr, minutesToTimeString(snapped));
  };

  const saveDraft = async () => {
    const name = draft.name.trim();
    if (!name || !draft.start || !draft.end || !editingDate) return;
    setSaving(true);
    try {
      if (editingId === 'new') {
        const block = await createScheduleBlock({
          name,
          start: buildIso(editingDate, draft.start),
          end: buildIso(editingDate, draft.end),
          areaId: draft.areaId || undefined,
        });
        setBlocksByDate((prev) => ({
          ...prev,
          [editingDate]: [...(prev[editingDate] || []), block].sort((a, b) =>
            a.start.localeCompare(b.start)
          ),
        }));
      } else {
        const block = await updateScheduleBlock({
          id: editingId,
          name,
          start: buildIso(editingDate, draft.start),
          end: buildIso(editingDate, draft.end),
          areaId: draft.areaId || null,
        });
        setBlocksByDate((prev) => ({
          ...prev,
          [editingDate]: (prev[editingDate] || [])
            .map((b) => (b.id === block.id ? block : b))
            .sort((a, b) => a.start.localeCompare(b.start)),
        }));
      }
      closeForm();
    } catch (err) {
      console.error('Failed to save schedule block', err);
    } finally {
      setSaving(false);
    }
  };

  const removeBlock = async (id, dateStr) => {
    setBlocksByDate((prev) => ({
      ...prev,
      [dateStr]: (prev[dateStr] || []).filter((b) => b.id !== id),
    }));
    closeForm();
    try {
      await deleteScheduleBlock(id);
    } catch (err) {
      console.error('Failed to remove schedule block', err);
    }
  };

  // Fetches Activities fresh, on demand — most visits to this screen never
  // use the suggestion feature, so there's no point pulling it on every
  // page load just in case.
  const generateSuggestions = async () => {
    setSuggestState('loading');
    try {
      const activities = await getActivities();
      const candidates = generateScheduleSuggestions({
        existingBlocks: blocksByDate[anchorDate] || [],
        activities,
        areas,
      });
      setSuggestions(candidates.map((c) => ({ ...c, included: true })));
      setSuggestState('reviewing');
    } catch (err) {
      console.error('Failed to generate schedule suggestions', err);
      setSuggestState('idle');
    }
  };

  const toggleSuggestionIncluded = (index) => {
    setSuggestions((prev) =>
      prev.map((s, i) => (i === index ? { ...s, included: !s.included } : s))
    );
  };

  const cancelSuggestions = () => {
    setSuggestState('idle');
    setSuggestions([]);
  };

  const confirmSuggestions = async () => {
    const toCreate = suggestions.filter((s) => s.included);
    if (toCreate.length === 0) {
      cancelSuggestions();
      return;
    }
    setSuggestSaving(true);
    try {
      const created = await Promise.all(
        toCreate.map((s) =>
          createScheduleBlock({
            name: s.name,
            start: buildIso(anchorDate, s.start),
            end: buildIso(anchorDate, s.end),
            areaId: s.areaId || undefined,
            source: 'Suggested',
          })
        )
      );
      setBlocksByDate((prev) => ({
        ...prev,
        [anchorDate]: [...(prev[anchorDate] || []), ...created].sort((a, b) =>
          a.start.localeCompare(b.start)
        ),
      }));
      cancelSuggestions();
    } catch (err) {
      console.error('Failed to add suggested blocks', err);
    } finally {
      setSuggestSaving(false);
    }
  };

  const handleBlockPointerDown = (e, top, height, dateStr) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragState({
      id: e.currentTarget.dataset.blockId,
      date: dateStr,
      pointerId: e.pointerId,
      startClientY: e.clientY,
      initialTop: top,
      currentTop: top,
      height,
      moved: false,
    });
  };

  const handleBlockPointerMove = (e) => {
    e.stopPropagation();
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    e.preventDefault();
    const delta = e.clientY - dragState.startClientY;
    const moved = dragState.moved || Math.abs(delta) > DRAG_THRESHOLD_PX;
    const maxTop = 24 * 60 * PX_PER_MIN - dragState.height;
    const currentTop = Math.max(0, Math.min(dragState.initialTop + delta, maxTop));
    setDragState((prev) => (prev ? { ...prev, currentTop, moved } : prev));
  };

  const handleBlockPointerUp = async (e, block, dateStr) => {
    e.stopPropagation();
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // already released — harmless
    }
    const finalState = dragState;
    setDragState(null);

    if (!finalState.moved) {
      openEdit(block, dateStr);
      return;
    }

    const snappedStart =
      Math.round(finalState.currentTop / PX_PER_MIN / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES;
    const originalStart = minutesSinceMidnight(timePart(block.start));
    const originalEnd = minutesSinceMidnight(timePart(block.end));
    const duration = originalEnd - originalStart;
    const newStart = minutesToTimeString(snappedStart);
    const newEnd = minutesToTimeString(snappedStart + duration);
    const newStartIso = buildIso(dateStr, newStart);
    const newEndIso = buildIso(dateStr, newEnd);

    setBlocksByDate((prev) => ({
      ...prev,
      [dateStr]: (prev[dateStr] || [])
        .map((b) => (b.id === block.id ? { ...b, start: newStartIso, end: newEndIso } : b))
        .sort((a, b) => a.start.localeCompare(b.start)),
    }));

    try {
      await updateScheduleBlock({ id: block.id, start: newStartIso, end: newEndIso });
    } catch (err) {
      console.error('Failed to move schedule block', err);
    }
  };

  const positionBlocks = (rawBlocks) =>
    (rawBlocks || []).map((block) => {
      const startMin = minutesSinceMidnight(timePart(block.start));
      const endMin = minutesSinceMidnight(timePart(block.end));
      return {
        ...block,
        top: startMin * PX_PER_MIN,
        height: Math.max(24, (endMin - startMin) * PX_PER_MIN),
      };
    });

  const headerTitle =
    viewMode === '3day'
      ? `${formatShortDayLabel(visibleDates[0])} – ${formatShortDayLabel(visibleDates[2])}`
      : formatDayLabel(anchorDate);

  return (
    <div className="schedule-screen">
      <ScreenHeader eyebrow="📅 Schedule" title={headerTitle} />

      <div className="schedule-day-nav">
        <button type="button" className="day-nav-arrow" onClick={() => setAnchorDate((d) => addDays(d, -step))}>
          ‹
        </button>
        <button type="button" className="day-nav-today" onClick={() => setAnchorDate(todayDateString())}>
          Today
        </button>
        <button type="button" className="day-nav-arrow" onClick={() => setAnchorDate((d) => addDays(d, step))}>
          ›
        </button>
        <div className="view-mode-toggle">
          <button
            type="button"
            className={viewMode === 'day' ? 'view-mode-button view-mode-button--active' : 'view-mode-button'}
            onClick={() => setViewMode('day')}
          >
            Day
          </button>
          <button
            type="button"
            className={viewMode === '3day' ? 'view-mode-button view-mode-button--active' : 'view-mode-button'}
            onClick={() => setViewMode('3day')}
          >
            3-Day
          </button>
        </div>
      </div>

      <main className="schedule-body">
        {state === 'loading' && <p className="section-status">Loading schedule…</p>}
        {state === 'error' && (
          <p className="section-status section-status--error">
            Couldn't load the schedule from Notion.
          </p>
        )}

        {state === 'ready' && (
          <div className="schedule-scroll">
            <div
              className="schedule-grid"
              style={{ gridTemplateColumns: `50px repeat(${visibleDates.length}, minmax(200px, 1fr))` }}
            >
              {viewMode === '3day' && (
                <>
                  <div className="grid-corner" />
                  {visibleDates.map((d) => (
                    <div key={`head-${d}`} className="day-column-header">
                      {formatShortDayLabel(d)}
                    </div>
                  ))}
                </>
              )}

              <div className="hour-gutter" style={{ height: 24 * 60 * PX_PER_MIN }}>
                {HOURS.map((h) => (
                  <div key={h} className="hour-row" style={{ top: h * 60 * PX_PER_MIN }}>
                    <span className="hour-label">
                      {formatTimeLabel(`${String(h).padStart(2, '0')}:00`)}
                    </span>
                  </div>
                ))}
              </div>

              {visibleDates.map((d) => {
                const positioned = positionBlocks(blocksByDate[d]);
                return (
                  <div
                    key={d}
                    className="timeline"
                    style={{ height: 24 * 60 * PX_PER_MIN }}
                    onClick={(e) => handleTimelineClick(e, d)}
                  >
                    {HOURS.map((h) => (
                      <div key={h} className="hour-row" style={{ top: h * 60 * PX_PER_MIN }} />
                    ))}
                    {positioned.map((block) => {
                      const isDragging = dragState && dragState.id === block.id && dragState.date === d;
                      const top = isDragging ? dragState.currentTop : block.top;
                      const classes = ['schedule-block'];
                      if (isDragging) classes.push('schedule-block--dragging');
                      if (block.source === 'Suggested') classes.push('schedule-block--suggested');
                      return (
                        <button
                          key={block.id}
                          type="button"
                          data-block-id={block.id}
                          className={classes.join(' ')}
                          style={{ top, height: block.height }}
                          onPointerDown={(e) => handleBlockPointerDown(e, block.top, block.height, d)}
                          onPointerMove={handleBlockPointerMove}
                          onPointerUp={(e) => handleBlockPointerUp(e, block, d)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="schedule-block-name">{block.name}</span>
                          <span className="schedule-block-time">
                            {formatTimeLabel(timePart(block.start))} – {formatTimeLabel(timePart(block.end))}
                            {block.areaName && ` · ${block.areaIcon || ''} ${block.areaName}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="schedule-actions-row">
          <button type="button" className="schedule-add-button" onClick={() => openAddAt(anchorDate, '09:00')}>
            + Add block
          </button>
          {viewMode === 'day' && (
            <button
              type="button"
              className="schedule-suggest-button"
              onClick={generateSuggestions}
              disabled={suggestState === 'loading'}
            >
              {suggestState === 'loading' ? 'Thinking…' : '✨ Suggest'}
            </button>
          )}
        </div>

        {suggestState === 'reviewing' && (
          <div className="schedule-modal-overlay" onClick={cancelSuggestions}>
            <div className="schedule-suggest-modal card" onClick={(e) => e.stopPropagation()}>
              <h3 className="schedule-suggest-title">Fill your day</h3>
              {suggestions.length === 0 ? (
                <p className="section-status">No free gaps big enough to fill right now.</p>
              ) : (
                <ul className="schedule-suggest-list">
                  {suggestions.map((s, i) => (
                    <li key={`${s.kind}-${s.sourceId}-${i}`} className="schedule-suggest-item">
                      <label className="schedule-suggest-item-label">
                        <input
                          type="checkbox"
                          checked={s.included}
                          onChange={() => toggleSuggestionIncluded(i)}
                        />
                        <span className="schedule-suggest-icon">{KIND_ICON[s.kind]}</span>
                        <span className="schedule-suggest-item-text">
                          <span className="schedule-suggest-item-name">{s.name}</span>
                          <span className="schedule-suggest-item-time">
                            {formatTimeLabel(s.start)} – {formatTimeLabel(s.end)}
                            {s.areaName && ` · ${s.areaIcon || ''} ${s.areaName}`}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <div className="schedule-form-actions">
                <div className="schedule-form-actions-right" style={{ marginLeft: 'auto' }}>
                  <button type="button" className="schedule-form-cancel" onClick={cancelSuggestions}>
                    Cancel
                  </button>
                  {suggestions.length > 0 && (
                    <button
                      type="button"
                      className="schedule-form-save"
                      disabled={suggestSaving || suggestions.every((s) => !s.included)}
                      onClick={confirmSuggestions}
                    >
                      {suggestSaving
                        ? 'Adding…'
                        : `Add ${suggestions.filter((s) => s.included).length} block${suggestions.filter((s) => s.included).length === 1 ? '' : 's'}`}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {editingId && (
          <div className="schedule-modal-overlay" onClick={closeForm}>
            <div className="schedule-form card" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                className="schedule-form-input"
                placeholder="What are you doing?"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                autoFocus
              />
              <div className="schedule-form-row">
                <label className="schedule-form-field">
                  <span>Start</span>
                  <input
                    type="time"
                    value={draft.start}
                    onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
                  />
                </label>
                <label className="schedule-form-field">
                  <span>End</span>
                  <input
                    type="time"
                    value={draft.end}
                    onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
                  />
                </label>
              </div>
              <label className="schedule-form-field schedule-form-field--full">
                <span>Area (optional)</span>
                <select
                  value={draft.areaId}
                  onChange={(e) => setDraft((d) => ({ ...d, areaId: e.target.value }))}
                >
                  <option value="">No area</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.icon} {area.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="schedule-form-actions">
                {editingId !== 'new' && (
                  <button
                    type="button"
                    className="schedule-form-delete"
                    onClick={() => removeBlock(editingId, editingDate)}
                  >
                    Remove
                  </button>
                )}
                <div className="schedule-form-actions-right">
                  <button type="button" className="schedule-form-cancel" onClick={closeForm}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="schedule-form-save"
                    disabled={!draft.name.trim() || saving}
                    onClick={saveDraft}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default ScheduleScreen;
