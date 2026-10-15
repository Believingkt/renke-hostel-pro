/**
 * Forward a request through the VPS static-IP relay proxy.
 *
 * Architecture:
 *   Edge Function → VPS Relay (fixed IP) → External API
 *
 * The VPS relay expects:
 *   POST /relay
 *   Headers: X-Relay-Token (auth), X-Target-Url (destination)
 *   Body: the original request body (passthrough)
 *   Additional headers prefixed with X-Forward-Header- are forwarded to the target.
 *
 * If STATIC_IP_PROXY_URL is not set, falls back to direct call (dev/testing),
 * unless `requireProxy` is set (PAYUNi: fixed source IP is mandatory).
 */
export async function fetchViaProxy(
  targetUrl: string,
  options: {
    method: string;
    headers: Record<string, string>;
    body: string;
    requireProxy?: boolean;
    signal?: AbortSignal;
  },
): Promise<Response> {
  const proxyUrl = Deno.env.get('STATIC_IP_PROXY_URL');
  const proxyToken = Deno.env.get('STATIC_IP_PROXY_TOKEN');

  if (options.requireProxy && (!proxyUrl || !proxyToken)) {
    throw new Error('STATIC_IP_PROXY_URL / STATIC_IP_PROXY_TOKEN is not configured (static IP relay is required)');
  }

  // Fallback: direct call when proxy is not configured (dev/testing)
  if (!proxyUrl) {
    console.warn('[Proxy] STATIC_IP_PROXY_URL not set, using direct connection');
    return fetch(targetUrl, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal: options.signal,
    });
  }

  // Build relay request — forward original headers with X-Forward-Header- prefix
  const relayHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Target-Url': targetUrl,
  };

  if (proxyToken) {
    relayHeaders['X-Relay-Token'] = proxyToken;
  }

  // Forward original headers to the target via the relay
  for (const [key, value] of Object.entries(options.headers)) {
    relayHeaders[`X-Forward-Header-${key}`] = value;
  }

  console.log(`[Proxy] Routing request via ${proxyUrl} → ${targetUrl}`);

  const response = await fetch(`${proxyUrl}/relay`, {
    method: 'POST',
    headers: relayHeaders,
    body: options.body,
    signal: options.signal,
  });

  return response;
}
