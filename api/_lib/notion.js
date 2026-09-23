const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });

// These are Notion *data source* IDs (the 2025-09-03+ API splits each
// database into one or more data sources; querying rows happens against
// the data source, not the parent database container).
const DATA_SOURCES = {
  areas: '1eb4a5c9-1f3b-4669-803f-a38abfecd6fd',
  goals: '94b23170-d740-4442-97a2-77257dbca881',
  activities: '8d0ff343-ee4a-41c9-b79a-e7da227b5c5c',
  projects: 'a512b661-668b-40cf-ac7b-addd2d77ec15',
  tasks: 'fedb36da-b3b5-4c66-8ce9-800dc2278db9',
  // Created 2026-09-20 for the Life Wheel feature — one row per (month, area),
  // score 0-10. Lives in Notion at the same "Life Dashboard" page as the
  // other databases.
  lifeWheel: '26d54eb4-df72-46f7-bef6-b6112c677546',
  // Created 2026-09-20 for the Schedule feature — one row per time block
  // (Name, Start, End, optional Area, Source: Manual/Suggested). Also on
  // the "Life Dashboard" page.
  schedule: '67767f56-b318-4df1-ae24-f0b3a8fbd232',
  // Pre-existing in the user's workspace, not created by this app — a
  // weekly grid tracker (one row per habit, a checkbox per day Mon-Sun,
  // reused across weeks rather than one row per day). Wired up 2026-09-23
  // for the Home screen's Habits card.
  habits: '0a5437b2-e912-4a54-91e4-e718029076b3',
};

async function queryAll(dataSourceId, params = {}) {
  const results = [];
  let cursor;
  do {
    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      ...params,
    });
    results.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);
  return results;
}

function sendJson(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body));
}

module.exports = { notion, DATA_SOURCES, queryAll, sendJson };
