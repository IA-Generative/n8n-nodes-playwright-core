'use strict';

const http = require('http');

const PORT = 8080;
const HOST = '0.0.0.0';

const MOCK_FQDN = 'playwright:3000';

// --- Handlers ---

function handleClaim(req, res, _body) {
  const id = Math.random().toString(36).slice(2, 10);
  const expiresAt = new Date(Date.now() + 3 * 60 * 1000).toISOString();
  console.log(`[claim] POST /claim -> id=${id}`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    data: { fqdn: MOCK_FQDN },
    expiresAt,
    id,
    preProvisioned: false,
    releaseMethod: 'POST',
    releasePath: `/release/${id}`,
    renewMethod: 'POST',
    renewPath: `/renew/${id}`,
    status: 'ok',
  }));
}

function handleRenew(req, res, _body, id) {
  const expiresAt = new Date(Date.now() + 3 * 60 * 1000).toISOString();
  console.log(`[claim] POST /renew/${id}`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    expiresAt,
    id,
    renewMethod: 'POST',
    renewPath: `/renew/${id}`,
    status: 'ok',
  }));
}

function handleRelease(req, res, _body, id) {
  console.log(`[claim] POST /release/${id}`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({}));
}

// --- Router ---

const EXACT_ROUTES = {
  'POST /claim': (req, res, body) => handleClaim(req, res, body),
};

const PREFIX_ROUTES = [
  { method: 'POST', prefix: '/renew/', handler: handleRenew },
  { method: 'POST', prefix: '/release/', handler: handleRelease },
];

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    const key = `${req.method} ${req.url}`;
    console.log(`[claim] ${key} ${body}`);

    const exactHandler = EXACT_ROUTES[key];
    if (exactHandler) {
      return exactHandler(req, res, body);
    }

    for (const route of PREFIX_ROUTES) {
      if (req.method === route.method && req.url.startsWith(route.prefix)) {
        const id = req.url.slice(route.prefix.length);
        return route.handler(req, res, body, id);
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[claim] mock claim-controller listening on ${PORT}`);
});
