// Builds the Google OAuth authorization URL for one accommodation.
// Fails closed when the platform OAuth app is not fully configured.
// deno-lint-ignore-file no-explicit-any
import {
  adminClient,
  authorizeAccommodation,
  callbackRedirectUri,
  corsHeaders,
  GOOGLE_AUTH_ENDPOINT,
  GOOGLE_SCOPE,
  getPlatformConfig,
  jsonResp,
} from "../_shared/gbp.ts";

const ALLOWED_RETURN_HOSTS = /(^|\.)(lovable\.app|lakeze\.com)$/;

function safeReturnUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    if (!ALLOWED_RETURN_HOSTS.test(u.hostname)) return null;
    return u.origin + u.pathname;
  } catch {
    return null;
  }
}

function randomToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function base64Url(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const accommodationId: string | undefined = body.accommodationId ??
      body.accommodation_id;
    if (!accommodationId) return jsonResp({ error: "accommodationId required" }, 400);

    const auth = await authorizeAccommodation(req, accommodationId);
    if (!auth.ok) return jsonResp({ error: auth.error }, auth.status);
    if (!auth.ctx.userId) return jsonResp({ error: "Unauthorized" }, 401);

    const admin = adminClient();
    const cfg = await getPlatformConfig(admin);
    if (
      !cfg?.oauth_client_id ||
      !cfg.client_secret_configured ||
      cfg.api_access_status === "REJECTED"
    ) {
      return jsonResp({ error: "GBP_PLATFORM_NOT_CONFIGURED" }, 400);
    }

    const state = randomToken();
    const codeVerifier = randomToken(48);
    const challenge = base64Url(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(codeVerifier),
      ),
    );

    const returnUrl = safeReturnUrl(body.returnUrl);
    const { error: stateErr } = await admin
      .from("google_business_profile_oauth_states")
      .insert({
        state,
        user_id: auth.ctx.userId,
        accommodation_id: accommodationId,
        code_verifier: codeVerifier,
        return_path: returnUrl,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
    if (stateErr) return jsonResp({ error: "state_create_failed" }, 500);

    const url = new URL(GOOGLE_AUTH_ENDPOINT);
    url.searchParams.set("client_id", cfg.oauth_client_id);
    url.searchParams.set("redirect_uri", cfg.redirect_uri || callbackRedirectUri());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_SCOPE);
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");

    return jsonResp({ authorizationUrl: url.toString() });
  } catch (_e) {
    return jsonResp({ error: "internal" }, 500);
  }
});
