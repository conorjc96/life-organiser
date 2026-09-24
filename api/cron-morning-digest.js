const { sendJson } = require('./_lib/notion');
const { requireCronAuth } = require('./_lib/cronAuth');
const { sendToStoredSubscription } = require('./_lib/push');
const {
  getTodayScheduleCount,
  getIncompleteTodayTaskNames,
  getIncompleteHabitNames,
} = require('./_lib/digest');

module.exports = async function handler(req, res) {
  if (!requireCronAuth(req, res)) return;
  try {
    const [scheduleCount, incompleteTasks, incompleteHabits] = await Promise.all([
      getTodayScheduleCount(),
      getIncompleteTodayTaskNames(),
      getIncompleteHabitNames(),
    ]);

    const lines = [];
    if (scheduleCount > 0) lines.push(`${scheduleCount} on today's schedule`);
    if (incompleteTasks.length > 0) {
      lines.push(`${incompleteTasks.length} task${incompleteTasks.length === 1 ? '' : 's'} for today`);
    }
    if (incompleteHabits.length > 0) {
      lines.push(`${incompleteHabits.length} habit${incompleteHabits.length === 1 ? '' : 's'} to fit in`);
    }
    const body = lines.length > 0 ? lines.join(' · ') : 'Nothing on the books yet — a clear day.';

    const result = await sendToStoredSubscription({ title: 'Good morning ☀️', body, url: '/' });
    return sendJson(res, 200, result);
  } catch (err) {
    console.error('Morning digest cron failed', err);
    return sendJson(res, 500, { error: 'Failed to send morning digest' });
  }
};
