const http = require('http');
const { readFileSync, existsSync } = require('fs');

// Load .env file manually (no dependencies needed)
if (existsSync('.env')) {
  const envContent = readFileSync('.env', 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) return;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  });
}

const PORT = parseInt(process.env.PORT || '3456', 10);
const RELAY_TOKEN = process.env.RELAY_TOKEN || '';
const MAX_BODY_SIZE = 1024 * 1024; // 1MB limit

if (!RELAY_TOKEN) {
  console.error('ERROR: RELAY_TOKEN is not set. Please configure .env file.');
  process.exit(1);
}

/**
 * Static IP Relay Server
 * 
 * Receives requests from Supabase Edge Functions and forwards them
 * to external APIs using this server's fixed IP address.
 * 
 * Protocol:
 *   POST /relay
 *   Headers:
 *     X-Relay-Token: authentication token
 *     X-Target-Url: destination URL
 *     X-Forward-Header-*: headers to forward to target
 *   Body: JSON payload to forward
 */

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function handleRelay(req, res) {
  // Authenticate
  const token = req.headers['x-relay-token'];
  if (token !== RELAY_TOKEN) {
    console.warn(`[${new Date().toISOString()}] AUTH FAILED from ${req.socket.remoteAddress}`);
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  // Get target URL
  const targetUrl = req.headers['x-target-url'];
  if (!targetUrl) {
    return sendJson(res, 400, { error: 'Missing X-Target-Url header' });
  }

  // Validate target URL (only allow HTTPS to known domains)
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return sendJson(res, 400, { error: 'Invalid target URL' });
  }

  // Built-in defaults + extra domains from env (comma-separated, supports *.suffix wildcards)
  const allowedDomains = [
    'booking.taiwantravelmap.com',
    'booking.travelmap.com.tw',
    ...(process.env.EXTRA_ALLOWED_DOMAINS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
  ];

  const matchesDomain = (host, pattern) => {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1); // ".example.com"
      return host === pattern.slice(2) || host.endsWith(suffix);
    }
    return host === pattern;
  };

  if (!allowedDomains.some(d => matchesDomain(parsedUrl.hostname, d))) {
    console.warn(`[${new Date().toISOString()}] BLOCKED domain: ${parsedUrl.hostname}`);
    return sendJson(res, 403, { error: 'Target domain not allowed' });
  }

  // Read body
  let body;
  try {
    body = await parseBody(req);
  } catch (e) {
    return sendJson(res, 413, { error: 'Request body too large' });
  }

  // Extract forwarded headers (X-Forward-Header-*)
  const forwardHeaders = { 'Content-Type': 'application/json' };
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.startsWith('x-forward-header-')) {
      const originalHeader = key.slice('x-forward-header-'.length);
      forwardHeaders[originalHeader] = value;
    }
  }

  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] RELAY → ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: forwardHeaders,
      body: body,
    });

    const responseBody = await response.text();
    const elapsed = Date.now() - startTime;

    console.log(`[${new Date().toISOString()}] RELAY ← ${response.status} (${elapsed}ms, ${responseBody.length} bytes)`);

    // Forward the response as-is
    res.writeHead(response.status, {
      'Content-Type': response.headers.get('content-type') || 'application/json',
      'Content-Length': Buffer.byteLength(responseBody),
    });
    res.end(responseBody);

  } catch (fetchError) {
    const elapsed = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] RELAY ERROR (${elapsed}ms):`, fetchError.message);
    sendJson(res, 502, { error: 'Failed to reach target', detail: fetchError.message });
  }
}

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.url === '/health') {
    return sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
  }

  // Relay endpoint
  if (req.url === '/relay' && req.method === 'POST') {
    try {
      await handleRelay(req, res);
    } catch (e) {
      console.error(`[${new Date().toISOString()}] UNHANDLED:`, e);
      sendJson(res, 500, { error: 'Internal server error' });
    }
    return;
  }

  // 404 for everything else
  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║  Static IP Relay Server                  ║
║  Port: ${String(PORT).padEnd(33)}║
║  Status: Running ✓                       ║
╚══════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.close(() => process.exit(0));
});
