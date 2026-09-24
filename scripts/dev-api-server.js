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
    // Swallow "write after end"/broken-pipe errors from writing to a
    // socket the client already aborted (e.g. navigated away mid-request)
    // — this is an unhandled 'error' event that crashes the whole process
    // if unguarded (Node's default for uncaught EventEmitter 'error').
    try {
      res.end(body);
    } catch {
      // client is gone, nothing to send it
    }
  };
  res.on('error', () => {});
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

  // Bust the cache for every file under api/ (handler + shared _lib/*
  // modules), not just the top-level handler — otherwise editing a shared
  // lib (e.g. adding a new DATA_SOURCES entry) silently keeps serving the
  // stale cached version until the whole process is restarted.
  for (const cachedPath of Object.keys(require.cache)) {
    if (cachedPath.startsWith(apiDir)) delete require.cache[cachedPath];
  }
  const handler = require(filePath);
  const query = Object.fromEntries(url.searchParams.entries());

  try {
    const body = await readJsonBody(req);
    await handler({ method: req.method, query, body, headers: req.headers }, res);
  } catch (err) {
    console.error(`API handler "${name}" threw:`, err);
    res.status(500).send(JSON.stringify({ error: 'Internal error' }));
  }
});

server.listen(PORT, () => {
  console.log(`Local API dev server on http://localhost:${PORT}`);
});

// Last-resort safety net: this server has died silently and repeatedly
// during development (an unhandled rejection or a write to an
// already-closed connection otherwise takes the whole process down).
// Log and keep running instead of crashing.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server staying up):', err);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection (server staying up):', err);
});
