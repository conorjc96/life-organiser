const webpush = require('web-push');
const { notion, DATA_SOURCES, queryAll } = require('./notion');

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.REACT_APP_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Single-user app — at most one subscription row ever exists. Upsert by
// finding (and archiving) any existing row before creating the new one,
// same "there can only be one" idea as how Life Wheel upserts per month.
async function saveSubscription(subscription) {
  const existing = await queryAll(DATA_SOURCES.pushSubscription);
  await Promise.all(existing.map((page) => notion.pages.update({ page_id: page.id, archived: true })));

  await notion.pages.create({
    parent: { type: 'data_source_id', data_source_id: DATA_SOURCES.pushSubscription },
    properties: {
      Name: { title: [{ text: { content: 'Subscription' } }] },
      Data: { rich_text: [{ text: { content: JSON.stringify(subscription) } }] },
      'Updated At': { date: { start: new Date().toISOString() } },
    },
  });
}

async function getSubscription() {
  const pages = await queryAll(DATA_SOURCES.pushSubscription);
  if (pages.length === 0) return null;
  const text = (pages[0].properties.Data?.rich_text || []).map((t) => t.plain_text).join('');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function clearSubscription() {
  const pages = await queryAll(DATA_SOURCES.pushSubscription);
  await Promise.all(pages.map((page) => notion.pages.update({ page_id: page.id, archived: true })));
}

// Sends to the one stored subscription, if any. A 404/410 from the push
// service means the browser dropped the subscription (e.g. the PWA was
// uninstalled) — clean it up rather than retrying it forever.
async function sendToStoredSubscription(payload) {
  const subscription = await getSubscription();
  if (!subscription) return { sent: false, reason: 'no-subscription' };

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { sent: true };
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      await clearSubscription();
      return { sent: false, reason: 'subscription-gone' };
    }
    throw err;
  }
}

module.exports = { saveSubscription, getSubscription, clearSubscription, sendToStoredSubscription };
