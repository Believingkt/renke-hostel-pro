// Google OAuth redirect target. Cannot rely on a Supabase JWT — trust is
// anchored on the one-time, short-lived state row created by oauth-start.
//
// SECURITY CONTRACT
//  - The accommodation is derived from the validated state row ONLY. A client
//    supplied accommodation id (query or body) is never honoured.
//  - The state's user must STILL be super_admin / hotel_admin of that
//    accommodation at callback time; revoked admins fail closed.
//  - Credentials are that accommodation's own OAuth client id + Vault secret.
//    No global platform config, no PLATFORM_SECRET_NAME, no cross-tenant
//    fallback.
//  - Redirect back to the app carries a coarse status only — never a code,
//    state, client id, secret or token.
// deno-lint-ignore-file no-explicit-any
import {
  adminClient,
  callbackRedirectUri,
  corsHeaders,
  exchangeCode,
  getAccommodationOAuthClientSecret,
  getAccommodationOAuthConfig,
  isStrictAccommodationAdminUser,
  refreshTokenSecretName,
  vaultGet,
  vaultSet,
} from "../_shared/gbp.ts";

function redirect(to: string) {
  return new Response(null, { status: 302, headers: { Location: to } });
}

function fallbackPage(message: string) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Google 授權</title><body style="font-family:system-ui;padding:40px">${message}</body>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

/** Only these coarse statuses may ever reach the browser URL. */
const SAFE_STATUS = [
  "success",
  "denied",
  "error",
  "failed",
  "not_configured",
  "permission_changed",
  "no_refresh_token",
] as const;
type SafeStatus = typeof SAFE_STATUS[number];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const admin = adminClient();

  if (!state) return fallbackPage("授權失敗：缺少 state 參數。");

  const { data: stateRow } = await admin
    .from("google_business_profile_oauth_states")
    .select("state, user_id, accommodation_id, code_verifier, return_path, expires_at, used_at")
    .eq("state", state)
    .maybeSingle();

  if (!stateRow) return fallbackPage("授權失敗：state 無效。");
  if (stateRow.used_at) return fallbackPage("授權失敗：此授權連結已使用過。");
  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    return fallbackPage("授權失敗：授權連結已過期，請重新操作。");
  }

  // One-time: mark used before doing anything else (blocks replay).
  const { data: claimed } = await admin
    .from("google_business_profile_oauth_states")
    .update({ used_at: new Date().toISOString() })
    .eq("state", state)
    .is("used_at", null)
    .select("state");
  if (!claimed || claimed.length === 0) {
    return fallbackPage("授權失敗：此授權連結已使用過。");
  }

  // Tenant binding: everything below uses ONLY the state's accommodation.
  const accommodationId: string = stateRow.accommodation_id;

  const back = (status: SafeStatus) => {
    const target = stateRow.return_path;
    if (!target) {
      return fallbackPage(
        status === "success"
          ? "Google 授權成功，請返回後台頁面繼續設定。"
          : "Google 授權失敗，請返回後台重新嘗試。",
      );
    }
    return redirect(`${target}?gbp_oauth=${status}`);
  };

  // The authorization may have been granted minutes ago — re-verify that the
  // initiating user is still a strict admin of this accommodation.
  const stillAdmin = await isStrictAccommodationAdminUser(
    admin,
    stateRow.user_id,
    accommodationId,
  );
  if (!stillAdmin) return back("permission_changed");

  if (!code) {
    await admin
      .from("accommodation_google_business_profile")
      .update({ connection_status: "ERROR" })
      .eq("accommodation_id", accommodationId);
    return back("denied");
  }

  try {
    const cfg = await getAccommodationOAuthConfig(admin, accommodationId);
    if (!cfg?.oauth_client_id || !cfg.client_secret_configured) {
      return back("not_configured");
    }
    const clientSecret = await getAccommodationOAuthClientSecret(
      admin,
      accommodationId,
      cfg,
    );
    if (!clientSecret) return back("not_configured");

    // Fail closed on client-id / secret rotation races: Google rejects the
    // exchange and we restart OAuth instead of falling back to old material.
    const tokens = await exchangeCode({
      code,
      clientId: cfg.oauth_client_id.trim(),
      clientSecret,
      redirectUri: callbackRedirectUri(),
      codeVerifier: stateRow.code_verifier,
    });

    const refreshKey = refreshTokenSecretName(accommodationId);
    if (tokens.refreshToken) {
      // Rotate in place — one active secret per accommodation, never a dupe.
      await vaultSet(admin, refreshKey, tokens.refreshToken);
    } else {
      // Google omits refresh_token on some re-consents. Keep an existing valid
      // token; on a first connect there is nothing to keep → fail closed.
      const existing = await vaultGet(admin, refreshKey);
      if (!existing) return back("no_refresh_token");
    }

    // Callback NEVER sets CONNECTED: account/location must still be validated
    // server-side by select-location.
    await admin
      .from("accommodation_google_business_profile")
      .upsert(
        {
          accommodation_id: accommodationId,
          connection_status: "READY_FOR_OAUTH",
          oauth_connected_at: new Date().toISOString(),
        },
        { onConflict: "accommodation_id" },
      );

    return back("success");
  } catch (_e) {
    // Never log code/token/secret material.
    console.error("gbp oauth callback failed");
    return back("failed");
  }
});
