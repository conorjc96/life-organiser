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
const { sendJson } = require('./_lib/notion');

const routes = {
  areas: require('./_lib/handlers/areas'),
  activities: require('./_lib/handlers/activities'),
  'life-wheel': require('./_lib/handlers/life-wheel'),
  goals: require('./_lib/handlers/goals'),
  schedule: require('./_lib/handlers/schedule'),
  habits: require('./_lib/handlers/habits'),
  tasks: require('./_lib/handlers/tasks'),
  projects: require('./_lib/handlers/projects'),
  'push-subscribe': require('./_lib/handlers/push-subscribe'),
  'cron-morning-digest': require('./_lib/handlers/cron-morning-digest'),
  'cron-afternoon-nudge': require('./_lib/handlers/cron-afternoon-nudge'),
  'song-parts': require('./_lib/handlers/song-parts'),
  exercises: require('./_lib/handlers/exercises'),
  'workout-log': require('./_lib/handlers/workout-log'),
  'food-log': require('./_lib/handlers/food-log'),
  foods: require('./_lib/handlers/foods'),
};

module.exports = async function handler(req, res) {
  const slug = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug;
  const route = routes[slug];
  if (!route) {
    return sendJson(res, 404, { error: `No handler for "${slug}"` });
  }
  return route(req, res);
};
