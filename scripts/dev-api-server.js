// Local stand-in for Vercel's serverless runtime during `npm start`.
// Routes /api/<name> to api/<name>.js the same way Vercel does in production,
// so CRA's dev server (via the "proxy" field in package.json) can reach it.
// Run with: node --env-file=.env.local scripts/dev-api-server.js
const http = require('http');
const { URL } = require('url');
const path = require('path');
const fs = require('fs');

const PORT = process.env.API_PORT || 3101;
const apiDir = path.join(__dirname, '..', 'api');

function augmentResponse(res) {
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };
  res.send = function (body) {
    res.end(body);
  };
  return res;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method !== 'PATCH' && req.method !== 'POST' && req.method !== 'PUT') {
      resolve(undefined);
      return;
    }
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  augmentResponse(res);
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (!url.pathname.startsWith('/api/')) {
    res.status(404).send(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const name = url.pathname.replace('/api/', '').split('/')[0];
  const filePath = path.join(apiDir, `${name}.js`);
  if (!fs.existsSync(filePath)) {
    res.status(404).send(JSON.stringify({ error: `No handler for "${name}"` }));
    return;
  }

  delete require.cache[require.resolve(filePath)];
  const handler = require(filePath);
  const query = Object.fromEntries(url.searchParams.entries());

  try {
    const body = await readJsonBody(req);
    await handler({ method: req.method, query, body }, res);
  } catch (err) {
    console.error(`API handler "${name}" threw:`, err);
    res.status(500).send(JSON.stringify({ error: 'Internal error' }));
  }
});

server.listen(PORT, () => {
  console.log(`Local API dev server on http://localhost:${PORT}`);
});
