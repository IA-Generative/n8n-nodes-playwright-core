'use strict';

const http = require('http');

const PORT = 8080;
const HOST = '0.0.0.0';

// --- Handlers ---

function handleClaim(req, res, body) {
  console.log(`[claim] POST /claim - body: ${body}`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: { fqdn: 'playwright:3000' } }));
}

// --- Router ---

const routes = {
  'POST /claim': handleClaim,
};

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    const key = `${req.method} ${req.url}`;
    console.log(`[claim] ${key} ${body}`);

    const handler = routes[key];
    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'not found' }));
    }

    handler(req, res, body);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[claim] mock claim-controller listening on ${PORT}`);
});
