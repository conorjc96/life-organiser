const { sendJson } = require('./notion');

// Vercel sends `Authorization: Bearer $CRON_SECRET` on its own scheduled
// invocations when CRON_SECRET is set — this keeps the endpoint from being
// triggerable by anyone who finds the URL (it'd otherwise spam a push
// notification with no rate limit).
function requireCronAuth(req, res) {
  const auth = req.headers?.authorization;
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return false;
  }
  return true;
}

module.exports = { requireCronAuth };
