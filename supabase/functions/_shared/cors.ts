// Shared CORS helper that returns headers reflecting an allow-listed origin.
// Use this for sensitive edge functions instead of `Access-Control-Allow-Origin: *`.
//
// Allowed:
//   - *.lakeze.com (production custom domains, hq, booking)
//   - *.lovable.app (preview + published Lovable URL)
//   - http://localhost:* (local dev)
// Anything else falls back to 'null' which browsers treat as a hard CORS reject.

const ALLOWED_HOST_SUFFIXES = [".lakeze.com", ".lovable.app"];
const ALLOWED_EXACT_HOSTS = new Set(["lakeze.com", "lovable.app"]);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (ALLOWED_EXACT_HOSTS.has(host)) return true;
    return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}

const BASE_HEADERS = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

/**
 * Returns CORS headers reflecting the request's origin only if it is allow-listed.
 * Disallowed origins receive `Access-Control-Allow-Origin: null`, which the browser rejects.
 */
export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  return {
    ...BASE_HEADERS,
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin! : "null",
  };
}
