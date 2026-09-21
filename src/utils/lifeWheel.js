export function currentMonthKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

// Reuses the same semantic colors already used elsewhere in the app
// (amber for "needs attention", emerald for "good") rather than inventing
// a new ramp — a life-wheel score is fundamentally the same
// bad-to-good status signal as a project's "At Risk" or "Complete" pill.
const BANDS = [
  { max: 3, key: 'critical', color: '#dc2626', tint: 'rgba(220, 38, 38, 0.12)' },
  { max: 6, key: 'warning', color: '#d97706', tint: 'rgba(217, 119, 6, 0.12)' },
  { max: 10, key: 'good', color: '#10b981', tint: 'rgba(16, 185, 129, 0.12)' },
];

export function scoreBand(score) {
  if (score === null || score === undefined) {
    return { key: 'unrated', color: '#d4d4d8', tint: '#f4f4f2' };
  }
  return BANDS.find((b) => score <= b.max) || BANDS[BANDS.length - 1];
}

// Low score = more suggested slots to add goals for that area; high score
// = area's already in a good place, so fewer are suggested. Always
// overridable — this only sets how many empty inputs show by default.
export function defaultSlotCount(score) {
  if (score === null || score === undefined) return 0;
  if (score <= 3) return 3;
  if (score <= 6) return 2;
  return 1;
}
