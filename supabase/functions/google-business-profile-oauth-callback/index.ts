// Google OAuth redirect target. Cannot rely on a Supabase JWT — trust is
// anchored on the one-time, short-lived state row created by oauth-start.
// deno-lint-ignore-file no-explicit-any
import {
  adminClient,
  callbackRedirectUri,
  corsHeaders,
  exchangeCode,
  getPlatformConfig,
  PLATFORM_SECRET_NAME,
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

  const back = (status: string) => {
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

  if (!code) {
    await admin
      .from("accommodation_google_business_profile")
      .update({ connection_status: "ERROR" })
      .eq("accommodation_id", stateRow.accommodation_id);
    return back("denied");
  }

  try {
    const cfg = await getPlatformConfig(admin);
    const clientSecret = await vaultGet(admin, PLATFORM_SECRET_NAME);
    if (!cfg?.oauth_client_id || !clientSecret) return back("not_configured");

    const tokens = await exchangeCode({
      code,
      clientId: cfg.oauth_client_id,
      clientSecret,
      redirectUri: cfg.redirect_uri || callbackRedirectUri(),
      codeVerifier: stateRow.code_verifier,
    });

    if (!tokens.refreshToken) {
      // Without offline access we cannot sync later — fail closed.
      return back("no_refresh_token");
    }

    await vaultSet(
      admin,
      refreshTokenSecretName(stateRow.accommodation_id),
      tokens.refreshToken,
    );

    await admin
      .from("accommodation_google_business_profile")
      .upsert(
        {
          accommodation_id: stateRow.accommodation_id,
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
