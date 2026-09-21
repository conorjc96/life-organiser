// Schedule block Start/End are stored as naive local wall-clock strings
// ("2026-09-21T09:00:00") — Notion echoes them back with a "+00:00"
// suffix appended, but never shifts the hour/minute digits. So every
// helper here works on the raw string (substring/regex), never via
// `new Date(iso).getHours()`, which WOULD apply a timezone conversion
// and could shift the displayed time depending on the browser's zone.
// This is deliberate and safe for a single-user, single-timezone app —
// don't "fix" it by switching to Date-object arithmetic.

export function todayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(dateString, delta) {
  const [y, m, d] = dateString.split('-').map(Number);
  const next = new Date(y, m - 1, d + delta);
  const ny = next.getFullYear();
  const nm = String(next.getMonth() + 1).padStart(2, '0');
  const nd = String(next.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

export function formatDayLabel(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// Short "Mon 22" style label for a multi-day column header.
export function formatShortDayLabel(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
  });
}

export function currentMinutesOfDay() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

// "2026-09-21T09:00:00.000+00:00" -> "09:00"
export function timePart(isoString) {
  if (!isoString) return '';
  const match = isoString.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : '';
}

// "2026-09-21T09:00:00.000+00:00" -> "2026-09-21"
export function datePart(isoString) {
  if (!isoString) return '';
  return isoString.slice(0, 10);
}

export function buildIso(dateString, timeString) {
  return `${dateString}T${timeString}:00`;
}

// "09:30" -> 570
export function minutesSinceMidnight(timeString) {
  if (!timeString) return 0;
  const [h, m] = timeString.split(':').map(Number);
  return h * 60 + m;
}

// 570 -> "09:30", clamped to a single day
export function minutesToTimeString(totalMinutes) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTimeLabel(timeString) {
  if (!timeString) return '';
  const [h, m] = timeString.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${period}` : `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}
