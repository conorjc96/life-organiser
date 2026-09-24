const { sendJson } = require('./_lib/notion');
const { saveSubscription, clearSubscription } = require('./_lib/push');

async function handlePost(req, res) {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return sendJson(res, 400, { error: 'a valid push subscription is required' });
  }
  await saveSubscription(subscription);
  return sendJson(res, 200, { ok: true });
}

async function handleDelete(req, res) {
  await clearSubscription();
  return sendJson(res, 200, { ok: true });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'POST') return await handlePost(req, res);
    if (req.method === 'DELETE') return await handleDelete(req, res);
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(`${req.method} /api/push-subscribe failed`, err);
    return sendJson(res, 500, { error: 'Failed to process push subscription request' });
  }
};
