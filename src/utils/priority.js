import { isOverdue } from './date';

// Shared urgency signal used by both Home's Priorities sort and the
// Schedule suggestion engine — a real deadline (or being overdue) always
// outranks everything else. Takes a raw due-date string directly rather
// than a Goal/Task object, since Goals call the field `dueDate` and Tasks
// call it `due`.
export function urgencyTier(dueDate) {
  if (dueDate && isOverdue(dueDate)) return 0; // overdue
  if (dueDate) return 1; // has a real deadline, not yet overdue
  return 2; // no deadline — no urgency signal of its own
}
