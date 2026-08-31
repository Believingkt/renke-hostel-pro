// Builds the Google OAuth authorization URL for ONE accommodation, using that
// accommodation's own Google Cloud OAuth client (BYO project).
//
// SECURITY CONTRACT
//  - Strict admin only: true super_admin, or hotel_admin of this accommodation.
//    website_content staff (editable / readonly / hidden) are DENIED — OAuth
//    connection management is credential ownership, not content editing.
//  - Authorization happens BEFORE any Vault read, state INSERT or URL build.
//  - No global fallback: the platform config table and PLATFORM_SECRET_NAME are
//    never read on this path.
// deno-lint-ignore-file no-explicit-any
import { isAccommodationAdmin, resolveCaller } from "../_shared/authz.ts";
import {
  adminClient,
  callbackRedirectUri,
  corsHeaders,
  getAccommodationOAuthConfig,
  GOOGLE_AUTH_ENDPOINT,
  GOOGLE_SCOPE,
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
    if (!accommodationId) {
      return jsonResp({ error: "accommodationId required" }, 400);
    }

    // 1) JWT + caller resolution. 2) strict admin authorization.
    const resolved = await resolveCaller(req);
    if (!resolved.ok) return jsonResp({ error: resolved.error }, resolved.status);
    if (!resolved.ctx.userId) return jsonResp({ error: "Unauthorized" }, 401);
    if (!(await isAccommodationAdmin(resolved.ctx, accommodationId))) {
      return jsonResp({ error: "Forbidden" }, 403);
    }

    const admin = adminClient();

    // 3) Per-accommodation configuration readiness (no global fallback).
    const cfg = await getAccommodationOAuthConfig(admin, accommodationId);
    if (!cfg?.oauth_client_id || cfg.oauth_client_id.trim() === "") {
      return jsonResp({ error: "GBP_ACCOMMODATION_NOT_CONFIGURED" }, 400);
    }
    if (!cfg.client_secret_configured) {
      return jsonResp({ error: "GBP_ACCOMMODATION_SECRET_NOT_CONFIGURED" }, 400);
    }
    // Owner-declared Google review outcome; it does NOT prove Google approval.
    // Google itself remains the authority at token-exchange time.
    if (cfg.application_status !== "APPROVED") {
      return jsonResp({ error: "GBP_ACCOMMODATION_API_NOT_APPROVED" }, 400);
    }

    // 4) Only now create the one-time PKCE state.
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
        user_id: resolved.ctx.userId,
        accommodation_id: accommodationId,
        code_verifier: codeVerifier,
        return_path: returnUrl,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
    if (stateErr) return jsonResp({ error: "state_create_failed" }, 500);

    // 5) Authorization URL built from THIS accommodation's client id, with the
    //    single shared callback URI every tenant registers in their own client.
    const url = new URL(GOOGLE_AUTH_ENDPOINT);
    url.searchParams.set("client_id", cfg.oauth_client_id.trim());
    url.searchParams.set("redirect_uri", callbackRedirectUri());
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
