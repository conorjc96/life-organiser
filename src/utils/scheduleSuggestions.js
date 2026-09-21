import { daysSince } from './date';
import { timePart, minutesSinceMidnight, minutesToTimeString, todayDateString } from './schedule';

// Default "workable" window suggestions are placed into — not the whole
// 24 hours, matching a normal waking/working day. Not user-configurable
// yet; revisit if that turns out to matter.
const WINDOW_START_MIN = 8 * 60; // 08:00
const WINDOW_END_MIN = 22 * 60; // 22:00
const MIN_GAP_MINUTES = 20; // gaps smaller than this aren't worth suggesting into
const MAX_SUGGESTIONS = 8; // leave breathing room, don't fill the whole day

const DURATION_MINUTES = {
  '30 mins': 30,
  '1 hour': 60,
  '2 hours': 120,
  '2+ hours': 150,
};

function parseActivityDuration(durationLabel) {
  return DURATION_MINUTES[durationLabel] || 60;
}

// Existing blocks -> the free spans left in the window, each
// { start, end } in minutes-since-midnight, filtered to a sane minimum size.
function computeFreeGaps(existingBlocks) {
  const busy = existingBlocks
    .map((b) => ({
      start: minutesSinceMidnight(timePart(b.start)),
      end: minutesSinceMidnight(timePart(b.end)),
    }))
    .filter((b) => b.end > WINDOW_START_MIN && b.start < WINDOW_END_MIN)
    .map((b) => ({
      start: Math.max(b.start, WINDOW_START_MIN),
      end: Math.min(b.end, WINDOW_END_MIN),
    }))
    .sort((a, b) => a.start - b.start);

  const gaps = [];
  let cursor = WINDOW_START_MIN;
  for (const block of busy) {
    if (block.start > cursor) gaps.push({ start: cursor, end: block.start });
    cursor = Math.max(cursor, block.end);
  }
  if (cursor < WINDOW_END_MIN) gaps.push({ start: cursor, end: WINDOW_END_MIN });

  return gaps.filter((g) => g.end - g.start >= MIN_GAP_MINUTES);
}

function areaNeglectDays(areaId, activities) {
  let latest = null;
  for (const a of activities) {
    if (a.areaId !== areaId || !a.lastDone) continue;
    if (!latest || a.lastDone > latest) latest = a.lastDone;
  }
  return daysSince(latest);
}

// Picks activities for variety, round-robin across areas ranked by neglect
// — so it doesn't suggest 3 things from the single most-neglected area
// while 7 others go untouched. Activities already done today are excluded
// (suggesting something you've already done isn't "variety").
function pickVarietyActivities(activities, areas, limit) {
  const today = todayDateString();
  const eligible = activities.filter((a) => a.lastDone !== today && a.areaId);

  const byArea = new Map();
  for (const a of eligible) {
    if (!byArea.has(a.areaId)) byArea.set(a.areaId, []);
    byArea.get(a.areaId).push(a);
  }
  for (const list of byArea.values()) {
    // Most-neglected individual activity first within its area.
    list.sort((a, b) => daysSince(b.lastDone) - daysSince(a.lastDone));
  }

  const areaOrder = areas
    .map((area) => ({ id: area.id, neglect: areaNeglectDays(area.id, activities) }))
    .sort((a, b) => b.neglect - a.neglect)
    .map((a) => a.id);

  const picked = [];
  let round = 0;
  while (picked.length < limit) {
    let addedAny = false;
    for (const areaId of areaOrder) {
      const list = byArea.get(areaId);
      if (list && list[round]) {
        picked.push(list[round]);
        addedAny = true;
        if (picked.length >= limit) break;
      }
    }
    if (!addedAny) break;
    round += 1;
  }
  return picked;
}

// Main entry point. Returns a flat list of proposed (not-yet-created)
// blocks: { kind, sourceId, name, areaId, areaName, areaIcon, start, end }.
// Nothing here talks to the API — the caller decides what to actually
// create after the user approves/rejects individual suggestions.
//
// Deliberately Activities-only, not Tasks/Goals: those are one-off or
// long-term items without a natural recurring slot, and suggesting them
// onto a "fill your day" timeline read as noise rather than help.
export function generateScheduleSuggestions({ existingBlocks, activities, areas }) {
  const gaps = computeFreeGaps(existingBlocks);
  if (gaps.length === 0) return [];

  const varietyQueue = pickVarietyActivities(activities, areas, MAX_SUGGESTIONS).map((a) => ({
    kind: 'activity',
    sourceId: a.id,
    name: a.name,
    durationMinutes: parseActivityDuration(a.duration),
    areaId: a.areaId,
    areaName: a.areaName,
    areaIcon: a.areaIcon,
  }));

  const suggestions = [];
  for (const gap of gaps) {
    let cursor = gap.start;
    while (cursor < gap.end && suggestions.length < MAX_SUGGESTIONS) {
      const remaining = gap.end - cursor;
      if (!varietyQueue.length || varietyQueue[0].durationMinutes > remaining) {
        break; // nothing left fits what's left of this gap
      }
      const picked = varietyQueue.shift();
      suggestions.push({
        ...picked,
        start: minutesToTimeString(cursor),
        end: minutesToTimeString(cursor + picked.durationMinutes),
      });
      cursor += picked.durationMinutes;
    }
    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }
  return suggestions;
}
