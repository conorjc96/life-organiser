const DAY_MS = 24 * 60 * 60 * 1000;

export function formatLastDone(dateString) {
  if (!dateString) return 'Never done';

  const then = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((startOfDay(now) - startOfDay(then)) / DAY_MS);

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return '1 month ago';
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return 'Over a year ago';
}

export function daysSince(dateString) {
  if (!dateString) return Infinity;
  const then = new Date(dateString);
  const now = new Date();
  return Math.floor((startOfDay(now) - startOfDay(then)) / DAY_MS);
}

export function formatDueDate(dateString) {
  if (!dateString) return null;
  return new Date(dateString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function isOverdue(dateString) {
  if (!dateString) return false;
  const then = new Date(dateString);
  const now = new Date();
  return startOfDay(then) < startOfDay(now);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
