const { sendJson } = require('./_lib/notion');
const { requireCronAuth } = require('./_lib/cronAuth');
const { sendToStoredSubscription } = require('./_lib/push');
const { getIncompleteTodayTaskNames, getIncompleteHabitNames } = require('./_lib/digest');

const MAX_NAMES = 4;

function listNames(names) {
  if (names.length <= MAX_NAMES) return names.join(', ');
  return `${names.slice(0, MAX_NAMES).join(', ')} +${names.length - MAX_NAMES} more`;
}

module.exports = async function handler(req, res) {
  if (!requireCronAuth(req, res)) return;
  try {
    const [incompleteTasks, incompleteHabits] = await Promise.all([
      getIncompleteTodayTaskNames(),
      getIncompleteHabitNames(),
    ]);

    // Calm, not naggy — if everything's already done, skip sending
    // anything rather than a congratulatory push every single afternoon.
    if (incompleteTasks.length === 0 && incompleteHabits.length === 0) {
      return sendJson(res, 200, { sent: false, reason: 'all-done' });
    }

    const parts = [];
    if (incompleteTasks.length > 0) parts.push(`Tasks: ${listNames(incompleteTasks)}`);
    if (incompleteHabits.length > 0) parts.push(`Habits: ${listNames(incompleteHabits)}`);

    const result = await sendToStoredSubscription({
      title: 'Still open today',
      body: parts.join(' · '),
      url: '/',
    });
    return sendJson(res, 200, result);
  } catch (err) {
    console.error('Afternoon nudge cron failed', err);
    return sendJson(res, 500, { error: 'Failed to send afternoon nudge' });
  }
};
