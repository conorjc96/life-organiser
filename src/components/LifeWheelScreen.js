import React, { useEffect, useMemo, useState } from 'react';
import {
  getAreas,
  getLifeWheel,
  setLifeWheelScore,
  getGoals,
  createGoal,
  setGoalTimeframe,
} from '../api/notion';
import { currentMonthKey, monthLabel, scoreBand, defaultSlotCount } from '../utils/lifeWheel';
import ScreenHeader from './ScreenHeader';
import './LifeWheelScreen.css';

// Canvas is much wider than the wheel itself (MAX_RADIUS) to leave room
// for full-text labels around the rim — always center-anchored (never
// start/end) so a label only needs HALF its width in clearance on each
// side, which is what actually avoids the clipping a text-anchor-by-angle
// approach hit last time, not just a bigger canvas alone.
const SIZE = 520;
const CENTER = SIZE / 2;
const MAX_RADIUS = 140;
const LABEL_RADIUS = MAX_RADIUS + 24;
const WEDGE_GAP_DEG = 3;
const RING_FRACTIONS = [0.25, 0.5, 0.75, 1];

function toXY(radius, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return [CENTER + radius * Math.sin(rad), CENTER - radius * Math.cos(rad)];
}

function wedgePath(radius, startDeg, endDeg) {
  const [x1, y1] = toXY(radius, startDeg);
  const [x2, y2] = toXY(radius, endDeg);
  return `M ${CENTER} ${CENTER} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`;
}

function LifeWheelScreen({ onBack }) {
  const month = useMemo(() => currentMonthKey(), []);
  const [areas, setAreas] = useState([]);
  const [scores, setScores] = useState({}); // { [areaId]: number }
  const [allGoals, setAllGoals] = useState([]); // every goal, any timeframe — search pool
  const [monthGoals, setMonthGoals] = useState([]); // subset already timeframe: This Month
  const [slotsByArea, setSlotsByArea] = useState({}); // { [areaId]: string[] } — draft text per slot, '' = empty
  const [saving, setSaving] = useState(false);
  const [activeSuggestKey, setActiveSuggestKey] = useState(null); // "areaId:index" of open dropdown
  const [state, setState] = useState('loading');

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      getAreas({ signal }),
      getLifeWheel(month, { signal }),
      getGoals(undefined, { signal }),
    ])
      .then(([areaList, ratings, goalList]) => {
        const sorted = [...areaList].sort((a, b) => a.name.localeCompare(b.name));
        setAreas(sorted);

        const scoreMap = {};
        for (const r of ratings) if (r.areaId) scoreMap[r.areaId] = r.score;
        setScores(scoreMap);

        setAllGoals(goalList);
        const thisMonth = goalList.filter((g) => g.timeframe === 'This Month');
        setMonthGoals(thisMonth);

        const slots = {};
        for (const area of sorted) {
          const existingCount = thisMonth.filter((g) => g.areaId === area.id).length;
          const count = Math.max(0, defaultSlotCount(scoreMap[area.id]) - existingCount);
          slots[area.id] = Array(count).fill('');
        }
        setSlotsByArea(slots);
        setState('ready');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to load life wheel', err);
        setState('error');
      });
    return () => controller.abort();
  }, [month]);

  const goalsByArea = useMemo(() => {
    const map = new Map();
    for (const goal of monthGoals) {
      if (!goal.areaId) continue;
      if (!map.has(goal.areaId)) map.set(goal.areaId, []);
      map.get(goal.areaId).push(goal);
    }
    return map;
  }, [monthGoals]);

  // Goals for this area that aren't already shown as a "This Month" chip —
  // the actual duplication risk is a goal that exists under some other
  // timeframe (Long Term, This Quarter, etc.), since anything already
  // This Month is already visible above the input as a chip.
  function findMatches(areaId, query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allGoals
      .filter((g) => g.areaId === areaId && g.timeframe !== 'This Month')
      .filter((g) => g.name.toLowerCase().includes(q))
      .slice(0, 5);
  }

  const selectExistingGoal = async (areaId, index, goal) => {
    setActiveSuggestKey(null);
    removeSlot(areaId, index);
    try {
      const updated = await setGoalTimeframe(goal.id, 'This Month');
      setMonthGoals((prev) => [...prev, updated]);
      setAllGoals((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    } catch (err) {
      console.error('Failed to move existing goal to this month', err);
    }
  };

  const commitScore = async (areaId, score) => {
    setScores((prev) => ({ ...prev, [areaId]: score }));
    // Rating an area can reveal more suggested slots, but never removes
    // slots on its own — shrinking is a manual "×" action now, so a slider
    // move never wipes out something you were mid-typing.
    setSlotsByArea((prev) => {
      const existingCount = (goalsByArea.get(areaId) || []).length;
      const suggested = Math.max(0, defaultSlotCount(score) - existingCount);
      const current = prev[areaId] || [];
      if (current.length >= suggested) return prev;
      return { ...prev, [areaId]: [...current, ...Array(suggested - current.length).fill('')] };
    });
    try {
      await setLifeWheelScore(month, areaId, score);
    } catch (err) {
      console.error('Failed to save life wheel score', err);
    }
  };

  const updateDraft = (areaId, index, value) => {
    setSlotsByArea((prev) => {
      const arr = [...(prev[areaId] || [])];
      arr[index] = value;
      return { ...prev, [areaId]: arr };
    });
  };

  const removeSlot = (areaId, index) => {
    setSlotsByArea((prev) => {
      const arr = [...(prev[areaId] || [])];
      arr.splice(index, 1);
      return { ...prev, [areaId]: arr };
    });
  };

  const addSlot = (areaId) => {
    setSlotsByArea((prev) => ({ ...prev, [areaId]: [...(prev[areaId] || []), ''] }));
  };

  const hasAnyFilledSlot = useMemo(
    () => Object.values(slotsByArea).some((slots) => slots.some((d) => d.trim())),
    [slotsByArea]
  );

  const saveAllGoals = async () => {
    const toCreate = [];
    for (const [areaId, drafts] of Object.entries(slotsByArea)) {
      for (const draft of drafts) {
        const name = draft.trim();
        if (name) toCreate.push({ areaId, name });
      }
    }
    if (toCreate.length === 0) return;
    setSaving(true);
    try {
      const created = await Promise.all(
        toCreate.map(({ areaId, name }) => createGoal({ name, areaId, timeframe: 'This Month' }))
      );
      setMonthGoals((prev) => [...prev, ...created]);
      // Drop only the slots that were just saved; any left blank stay put
      // so an unfinished draft in one area isn't lost by saving another.
      setSlotsByArea((prev) => {
        const next = {};
        for (const [areaId, drafts] of Object.entries(prev)) {
          next[areaId] = drafts.filter((d) => !d.trim());
        }
        return next;
      });
    } catch (err) {
      console.error('Failed to save goals', err);
    } finally {
      setSaving(false);
    }
  };

  const wedgeCount = areas.length || 8;
  const wedgeAngle = 360 / wedgeCount;

  return (
    <div className="life-wheel-screen">
      <ScreenHeader eyebrow="🎡 Life Wheel" title={monthLabel(month)} onBack={onBack} />

      <main className="life-wheel-body">
        {state === 'loading' && <p className="section-status">Loading your life wheel…</p>}
        {state === 'error' && (
          <p className="section-status section-status--error">
            Couldn't load the life wheel from Notion.
          </p>
        )}

        {state === 'ready' && (
          <div className="card">
            <div className="life-wheel-layout">
              <svg
                className="life-wheel-svg"
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                role="img"
                aria-label="Life wheel: this month's ratings by area"
              >
                {RING_FRACTIONS.map((f) => (
                  <circle
                    key={f}
                    cx={CENTER}
                    cy={CENTER}
                    r={MAX_RADIUS * f}
                    className="life-wheel-ring"
                  />
                ))}
                {areas.map((area, i) => {
                  const start = i * wedgeAngle + WEDGE_GAP_DEG / 2;
                  const end = (i + 1) * wedgeAngle - WEDGE_GAP_DEG / 2;
                  const mid = (start + end) / 2;
                  const score = scores[area.id];
                  const band = scoreBand(score);
                  const radius = score === undefined || score === null
                    ? MAX_RADIUS * 0.15
                    : Math.max(6, (score / 10) * MAX_RADIUS);
                  const [lx, ly] = toXY(LABEL_RADIUS, mid);
                  return (
                    <g key={area.id}>
                      <path d={wedgePath(radius, start, end)} fill={band.color} />
                      {/* Always center-anchored, regardless of angle — a
                          start/end anchor lets text run arbitrarily far in
                          one direction past the anchor point, which is
                          what clipped this at the canvas edge last time.
                          Centering only ever needs half the label's width
                          in clearance on each side. */}
                      <text
                        x={lx}
                        y={ly}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="life-wheel-label"
                      >
                        {area.icon} {area.name}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <div className="life-wheel-rows">
                {areas.map((area) => {
                  const score = scores[area.id];
                  const band = scoreBand(score);
                  const existingGoals = goalsByArea.get(area.id) || [];
                  const slots = slotsByArea[area.id] || [];

                  return (
                    <div key={area.id} className="wheel-row">
                      <div className="wheel-row-head">
                        <span className="wheel-row-icon" aria-hidden="true">{area.icon}</span>
                        <span className="wheel-row-name">{area.name}</span>
                        <span
                          className="wheel-row-score"
                          style={{ color: band.color, backgroundColor: band.tint }}
                        >
                          {score === null || score === undefined ? 'Not rated' : `${score}/10`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={1}
                        value={score ?? 0}
                        className="wheel-slider"
                        style={{ accentColor: band.color }}
                        onChange={(e) => setScores((prev) => ({ ...prev, [area.id]: Number(e.target.value) }))}
                        onMouseUp={(e) => commitScore(area.id, Number(e.target.value))}
                        onTouchEnd={(e) => commitScore(area.id, Number(e.target.value))}
                        aria-label={`Rate ${area.name} out of 10`}
                      />

                      {existingGoals.length > 0 && (
                        <ul className="wheel-goal-chips">
                          {existingGoals.map((goal) => (
                            <li key={goal.id} className="wheel-goal-chip">✓ {goal.name}</li>
                          ))}
                        </ul>
                      )}

                      {slots.map((draft, index) => {
                        const key = `${area.id}:${index}`;
                        const suggestions =
                          activeSuggestKey === key ? findMatches(area.id, draft) : [];
                        return (
                          <div key={index} className="wheel-goal-input-wrap">
                            <div className="wheel-goal-input-row">
                              <input
                                type="text"
                                className="wheel-goal-input"
                                placeholder={`Add a goal for ${area.name}…`}
                                value={draft}
                                onChange={(e) => updateDraft(area.id, index, e.target.value)}
                                onFocus={() => setActiveSuggestKey(key)}
                                onBlur={() =>
                                  setTimeout(
                                    () => setActiveSuggestKey((k) => (k === key ? null : k)),
                                    150
                                  )
                                }
                              />
                              <button
                                type="button"
                                className="wheel-goal-remove-button"
                                onClick={() => removeSlot(area.id, index)}
                                aria-label="Remove this slot"
                              >
                                ×
                              </button>
                            </div>
                            {suggestions.length > 0 && (
                              <ul className="wheel-goal-suggestions">
                                {suggestions.map((goal) => (
                                  <li key={goal.id}>
                                    <button
                                      type="button"
                                      className="wheel-goal-suggestion"
                                      onMouseDown={() => selectExistingGoal(area.id, index, goal)}
                                    >
                                      <span className="wheel-goal-suggestion-name">{goal.name}</span>
                                      <span className="wheel-goal-suggestion-tf">{goal.timeframe || 'No timeframe'}</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}

                      <button
                        type="button"
                        className="wheel-add-slot"
                        onClick={() => addSlot(area.id)}
                      >
                        + Add another
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              className="wheel-save-all-button"
              disabled={!hasAnyFilledSlot || saving}
              onClick={saveAllGoals}
            >
              {saving ? 'Saving…' : 'Save all goals'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default LifeWheelScreen;
