// One-off dev tool: prints each data source's property names, types, and
// select/status option values so api/*.js can be wired to the real schema.
// Run with: node --env-file=.env.local scripts/inspect-notion.js
const { Client } = require('@notionhq/client');
const { DATA_SOURCES } = require('../api/_lib/notion');

const notion = new Client({ auth: process.env.NOTION_API_KEY });

function describeProperty(prop) {
  const base = `  - "${prop.name}"  [${prop.type}]`;
  if (prop.type === 'select' || prop.type === 'status' || prop.type === 'multi_select') {
    const options = (prop[prop.type]?.options || []).map((o) => o.name);
    return `${base}  options: ${JSON.stringify(options)}`;
  }
  if (prop.type === 'relation') {
    return `${base}  -> data_source: ${prop.relation?.data_source_id}`;
  }
  return base;
}

async function inspect(label, dataSourceId) {
  console.log(`\n=== ${label} (${dataSourceId}) ===`);
  const ds = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
  const title = ds.title?.map((t) => t.plain_text).join('') || '(untitled)';
  console.log(`title: ${title}`);
  for (const prop of Object.values(ds.properties)) {
    console.log(describeProperty(prop));
  }

  const sample = await notion.dataSources.query({ data_source_id: dataSourceId, page_size: 1 });
  if (sample.results[0]) {
    console.log('sample row property keys:', Object.keys(sample.results[0].properties));
  }
}

(async () => {
  if (!process.env.NOTION_API_KEY) {
    console.error('NOTION_API_KEY is not set. Put it in .env.local and run with --env-file=.env.local');
    process.exit(1);
  }
  for (const [label, id] of Object.entries(DATA_SOURCES)) {
    await inspect(label, id);
  }
})();
