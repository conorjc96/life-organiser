// Vercel's Hobby plan caps a deployment at 12 Serverless Functions, and
// every top-level file under api/ counts as one — this app had grown to
// 16 (one per resource: tasks, habits, schedule, songParts, foods, ...).
// Rather than trimming features, this single catch-all route collapses
// all of them into ONE function: it dispatches by the first path segment
// to a handler module living under api/_lib/handlers/ (an underscore-
// prefixed folder, which Vercel excludes from its own auto-routing, so
// those files no longer count against the limit). Adding a new resource
// from here on means adding a handler file + one line below, not a new
// top-level api/*.js file — doing that again would silently re-create
// this same ceiling.
//
// Handlers are required LAZILY, inside the request handler, not eagerly at
// module load — the first version of this file required all 16 up front,
// which meant a single bad module (api/_lib/push.js throwing during
// webpush.setVapidDetails at import time, for one real example) crashed
// EVERY route, not just the ones that actually use it. Before this file
// existed, each route was its own isolated Vercel Function, so one
// module's failure never took down unrelated ones — lazy-requiring here
// restores that isolation despite everything now living in one function.
const { sendJson } = require('./_lib/notion');

const routeFiles = {
  areas: './_lib/handlers/areas',
  activities: './_lib/handlers/activities',
  'life-wheel': './_lib/handlers/life-wheel',
  goals: './_lib/handlers/goals',
  schedule: './_lib/handlers/schedule',
  habits: './_lib/handlers/habits',
  tasks: './_lib/handlers/tasks',
  projects: './_lib/handlers/projects',
  'push-subscribe': './_lib/handlers/push-subscribe',
  'cron-morning-digest': './_lib/handlers/cron-morning-digest',
  'cron-afternoon-nudge': './_lib/handlers/cron-afternoon-nudge',
  'song-parts': './_lib/handlers/song-parts',
  exercises: './_lib/handlers/exercises',
  'workout-log': './_lib/handlers/workout-log',
  'food-log': './_lib/handlers/food-log',
  foods: './_lib/handlers/foods',
};

module.exports = async function handler(req, res) {
  const slug = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug;
  const routeFile = routeFiles[slug];
  if (!routeFile) {
    return sendJson(res, 404, { error: `No handler for "${slug}"` });
  }
  try {
    const route = require(routeFile);
    return await route(req, res);
  } catch (err) {
    console.error(`Failed to load handler for "${slug}"`, err);
    return sendJson(res, 500, { error: `Handler for "${slug}" failed to load` });
  }
};
