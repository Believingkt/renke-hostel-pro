// Facebook Login -> Supabase session bridge (Custom OAuth mode).
//
// Mirrors line-oauth-exchange. Flow:
//   1. Frontend posts { code, redirectUri }
//   2. Exchange code -> access_token via Facebook Graph
//   3. GET /me?fields=id,name,email,picture to get user profile
//   4. Use Service Role to find-or-create auth.users + upsert platform_members
//   5. Generate magic-link OTP -> verifyOtp -> Supabase session
//   6. Return { access_token, refresh_token, ... }
//
// Required env (Lovable Cloud Secrets):
//   - FACEBOOK_APP_ID
//   - FACEBOOK_APP_SECRET
//   - SUPABASE_URL                (auto)
//   - SUPABASE_SERVICE_ROLE_KEY   (auto)
//   - SUPABASE_ANON_KEY           (auto)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCorsHeaders } from "../_shared/cors.ts";

interface ExchangeBody {
  code?: string;
  redirectUri?: string;
}

async function tryOptionalUpdate(admin: ReturnType<typeof createClient>, table: string, matchColumn: string, matchValue: string, values: Record<string, unknown>) {
  const { error } = await admin.from(table).update(values).eq(matchColumn, matchValue);
  if (error && !/column|schema cache|Could not find/i.test(error.message || "")) {
    console.warn(`${table} optional reactivation update failed`, error);
  }
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const appId = Deno.env.get("FACEBOOK_APP_ID");
  const appSecret = Deno.env.get("FACEBOOK_APP_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!appId || !appSecret) {
    return json({ error: "Facebook 登入尚未設定，請先填入 FACEBOOK_APP_ID 與 FACEBOOK_APP_SECRET" }, 500);
  }
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: "後端環境變數缺失（SUPABASE_URL / SERVICE_ROLE / ANON）" }, 500);
  }

  let body: ExchangeBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "請求格式錯誤" }, 400);
  }
  const { code, redirectUri } = body;
  if (!code || !redirectUri) {
    return json({ error: "缺少必要參數（code / redirectUri）" }, 400);
  }

  // ── 1. Exchange code -> access_token ────────────────────────────────────
  let accessToken: string;
  try {
    const tokenUrl = new URL("https://graph.facebook.com/v18.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);
    const resp = await fetch(tokenUrl.toString());
    const tokenJson = await resp.json();
    if (!resp.ok || !tokenJson.access_token) {
      console.error("Facebook token exchange failed", tokenJson);
      return json({ error: tokenJson?.error?.message || "Facebook 授權碼交換失敗" }, 400);
    }
    accessToken = tokenJson.access_token;
  } catch (err) {
    console.error("Facebook token endpoint error", err);
    return json({ error: "無法連線到 Facebook 登入服務" }, 502);
  }

  // ── 2. Fetch user profile ───────────────────────────────────────────────
  let profile: any;
  try {
    const meUrl = new URL("https://graph.facebook.com/v18.0/me");
    meUrl.searchParams.set("fields", "id,name,email,picture");
    meUrl.searchParams.set("access_token", accessToken);
    const resp = await fetch(meUrl.toString());
    profile = await resp.json();
    if (!resp.ok || !profile.id) {
      console.error("Facebook /me failed", profile);
      return json({ error: profile?.error?.message || "無法取得 Facebook 使用者資料" }, 400);
    }
  } catch (err) {
    console.error("Facebook /me error", err);
    return json({ error: "無法連線到 Facebook 使用者 API" }, 502);
  }

  const fbId = String(profile.id);
  const displayName = profile.name || "Facebook 使用者";
  const fbEmail: string | null = profile.email || null;
  const picture: string | null = profile.picture?.data?.url || null;
  // Synthetic email if Facebook didn't return one (user didn't grant email scope
  // or has no verified email on file).
  const email = fbEmail || `fb_${fbId}@facebook.lakeze.local`;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 3. Find or create user ──────────────────────────────────────────────
  let userId: string | null = null;
  let existingMetadata: Record<string, unknown> = {};
  try {
    const lookupResp = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    );
    if (lookupResp.ok) {
      const lookup = await lookupResp.json();
      const users = Array.isArray(lookup?.users) ? lookup.users : [];
      const match = users.find((u: any) => (u.email || "").toLowerCase() === email.toLowerCase());
      if (match?.id) {
        userId = match.id;
        existingMetadata = match.raw_user_meta_data || match.user_metadata || {};
      }
    }
  } catch (err) {
    console.warn("admin user lookup failed", err);
  }

  const reactivationMetadata = {
    ...existingMetadata,
    provider: "facebook",
    fb_id: fbId,
    name: displayName,
    avatar_url: picture,
    last_reactivated_at: new Date().toISOString(),
    reactivated_via: "facebook",
  };

  if (!userId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: reactivationMetadata,
    });
    if (createErr || !created?.user?.id) {
      console.error("createUser failed", createErr);
      return json({ error: createErr?.message || "建立帳號失敗" }, 500);
    }
    userId = created.user.id;
  } else {
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: reactivationMetadata,
    });
  }

  try {
    await admin.from("profiles").upsert(
      {
        id: userId,
        name: displayName,
        email,
      },
      { onConflict: "id" },
    );
  } catch (err) {
    console.warn("profiles upsert failed", err);
  }
  await tryOptionalUpdate(admin, "profiles", "id", userId, {
    deleted_at: null,
    is_active: true,
    status: "active",
  });

  try {
    await admin.from("platform_members").upsert(
      {
        user_id: userId,
        name: displayName,
        email: fbEmail || email,
        avatar_url: picture,
      },
      { onConflict: "user_id" },
    );
  } catch (err) {
    console.warn("platform_members upsert failed", err);
  }
  await tryOptionalUpdate(admin, "platform_members", "user_id", userId, {
    deleted_at: null,
    is_active: true,
    status: "active",
  });

  // ── 4. Generate magic-link OTP and verify server-side for tokens ────────
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !linkData?.properties?.email_otp) {
    console.error("generateLink failed", linkErr);
    return json({ error: linkErr?.message || "無法產生登入 token" }, 500);
  }

  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: sessionData, error: verifyErr } = await anon.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: "email",
  });
  if (verifyErr || !sessionData?.session) {
    console.error("verifyOtp failed", verifyErr);
    return json({ error: verifyErr?.message || "無法建立 Supabase session" }, 500);
  }

  return json({
    access_token: sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token,
    user_id: userId,
    email,
    name: displayName,
  });
});
