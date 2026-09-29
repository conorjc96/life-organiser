// Vercel's Hobby plan caps a deployment at 12 Serverless Functions, and
// every top-level file under api/ counts as one — this app had grown to
// 16 (one per resource: tasks, habits, schedule, songParts, foods, ...).
// Rather than trimming features, this single catch-all route collapses
// all of them into ONE function: it dispatches by the first path segment
// to a handler module living under api/_lib/handlers/ (an underscore-
// prefixed folder, which Vercel excludes from its own auto-routing, so
// those files no longer count against the limit). Adding a new resource
// from here on means adding a handler file + one new `case` below, not a
// new top-level api/*.js file — doing that again would silently re-create
// this same ceiling.
//
// Three real bugs were found and fixed getting this working, in order:
//
// 1. Handlers were required EAGERLY at module load (one object literal
//    building a lookup table of already-`require()`d modules). One of them
//    (api/_lib/push.js) called webpush.setVapidDetails() unconditionally
//    at its own module top level; if that throws, it crashed this whole
//    dispatcher module — every route, not just push's. Before this file
//    existed, each route was its own isolated Vercel Function, so one
//    module's failure never took down unrelated ones. Fixed by requiring
//    lazily, per request, inside the switch below (see #3 for why a
//    switch specifically, not a lookup table).
//
// 2. The route name was read from req.query.slug, which Vercel's own docs
//    describe [...slug].js as auto-populating. On this project's actual
//    deployment it came back undefined on every request (confirmed live:
//    every route 404'd with 'No handler for "undefined"'). Fixed by
//    parsing the segment directly off req.url instead — a more primitive
//    approach that doesn't depend on that platform behavior at all (the
//    same technique scripts/dev-api-server.js already used locally, which
//    is why local testing never surfaced this).
//
// 3. Lazy-loading via a `{ name: './path' }` lookup object and then
//    `require(thatVariable)` is NOT statically analyzable — Vercel's
//    build-time dependency tracer only bundles files it can find through
//    literal `require('./literal/path')` calls, so none of the 16 handler
//    files (or their api/_lib/*.js dependencies) actually got included in
//    the deployed function, and every route 500'd with the require
//    failing at runtime ("Handler for X failed to load"). This didn't
//    show up locally because local testing reads the real filesystem
//    directly, bypassing Vercel's bundler entirely. Fixed by switching to
//    a `switch` statement with each `require()` call written out literally
//    — every branch is statically traceable (so the bundler includes every
//    handler file), while JS still only *executes* the one matching
//    require() per request (so the lazy-loading/isolation property from
//    fix #1 is preserved).
//
// If this file is touched again: every case must keep its require() call
// as a literal string argument, written directly in that case, not read
// from a variable/object — that's the specific thing that broke bundling.
const { sendJson } = require('./_lib/notion');

function loadHandler(slug) {
  switch (slug) {
    case 'areas':
      return require('./_lib/handlers/areas');
    case 'activities':
      return require('./_lib/handlers/activities');
    case 'life-wheel':
      return require('./_lib/handlers/life-wheel');
    case 'goals':
      return require('./_lib/handlers/goals');
    case 'schedule':
      return require('./_lib/handlers/schedule');
    case 'habits':
      return require('./_lib/handlers/habits');
    case 'tasks':
      return require('./_lib/handlers/tasks');
    case 'projects':
      return require('./_lib/handlers/projects');
    case 'push-subscribe':
      return require('./_lib/handlers/push-subscribe');
    case 'cron-morning-digest':
      return require('./_lib/handlers/cron-morning-digest');
    case 'cron-afternoon-nudge':
      return require('./_lib/handlers/cron-afternoon-nudge');
    case 'song-parts':
      return require('./_lib/handlers/song-parts');
    case 'exercises':
      return require('./_lib/handlers/exercises');
    case 'workout-log':
      return require('./_lib/handlers/workout-log');
    case 'food-log':
      return require('./_lib/handlers/food-log');
    case 'foods':
      return require('./_lib/handlers/foods');
    default:
      return null;
  }
}

module.exports = async function handler(req, res) {
  const pathname = (req.url || '').split('?')[0];
  const slug = pathname.replace(/^\/api\//, '').split('/')[0];

  let route;
  try {
    route = loadHandler(slug);
  } catch (err) {
    console.error(`Failed to load handler module for "${slug}"`, err);
    return sendJson(res, 500, { error: `Handler for "${slug}" failed to load`, detail: err.message });
  }

  if (!route) {
    return sendJson(res, 404, { error: `No handler for "${slug}"` });
  }

  try {
    return await route(req, res);
  } catch (err) {
    console.error(`Handler for "${slug}" threw`, err);
    return sendJson(res, 500, { error: `Handler for "${slug}" failed`, detail: err.message });
  }
};
