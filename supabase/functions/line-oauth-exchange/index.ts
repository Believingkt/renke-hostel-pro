// LINE Login v2.1 (OIDC) -> Supabase session bridge (Custom OIDC mode).
//
// Flow:
//   1. Frontend posts { code, redirectUri, expectedNonce }
//   2. Exchange code -> id_token via LINE token endpoint
//   3. Verify iss / aud / nonce / exp
//   4. Use Service Role to find-or-create the user in auth.users
//        - Match by LINE sub stored in user_metadata.line_sub (via email lookup
//          fallback). Synthetic email used when LINE didn't return one.
//        - Upsert public.profiles
//   5. Generate magic-link OTP, verify it server-side to obtain a real Supabase
//      session, return { access_token, refresh_token } to the client.
//   6. Frontend calls supabase.auth.setSession({...}) to finish login.
//
// Required env (Lovable Cloud Secrets):
//   - LINE_CHANNEL_ID
//   - LINE_CHANNEL_SECRET
//   - SUPABASE_URL                (auto)
//   - SUPABASE_SERVICE_ROLE_KEY   (auto)
//   - SUPABASE_ANON_KEY           (auto, used for verifyOtp)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCorsHeaders } from "../_shared/cors.ts";

interface ExchangeBody {
  code?: string;
  redirectUri?: string;
  expectedNonce?: string;
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  const full = pad ? padded + "=".repeat(4 - pad) : padded;
  const binary = atob(full);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid id_token format");
  return JSON.parse(base64UrlDecode(parts[1]));
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

  const channelId = Deno.env.get("LINE_CHANNEL_ID");
  const channelSecret = Deno.env.get("LINE_CHANNEL_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!channelId || !channelSecret) {
    return json({ error: "LINE 登入尚未設定，請先填入 LINE_CHANNEL_ID 與 LINE_CHANNEL_SECRET" }, 500);
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
  const { code, redirectUri, expectedNonce } = body;
  if (!code || !redirectUri || !expectedNonce) {
    return json({ error: "缺少必要參數（code / redirectUri / expectedNonce）" }, 400);
  }

  // ── 1. Exchange code -> id_token ────────────────────────────────────────
  const tokenParams = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: channelId,
    client_secret: channelSecret,
  });

  let tokenJson: any;
  try {
    const resp = await fetch("https://api.line.me/oauth2/v2.1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });
    tokenJson = await resp.json();
    if (!resp.ok) {
      console.error("LINE token exchange failed", tokenJson);
      return json({ error: tokenJson?.error_description || "LINE 授權碼交換失敗" }, 400);
    }
  } catch (err) {
    console.error("LINE token endpoint error", err);
    return json({ error: "無法連線到 LINE 登入服務" }, 502);
  }

  const idToken: string | undefined = tokenJson.id_token;
  if (!idToken) return json({ error: "LINE 未回傳 id_token，請確認已啟用 OpenID Connect" }, 400);

  // ── 2. Verify id_token claims ───────────────────────────────────────────
  let claims: Record<string, any>;
  try {
    claims = decodeJwtPayload(idToken);
  } catch (err) {
    console.error("id_token decode failed", err);
    return json({ error: "無法解析 LINE id_token" }, 400);
  }
  if (claims.iss !== "https://access.line.me") return json({ error: "id_token 簽發者不正確" }, 400);
  if (claims.aud !== channelId) return json({ error: "id_token 對象不正確" }, 400);
  if (claims.nonce !== expectedNonce) return json({ error: "nonce 驗證失敗，請重新登入" }, 400);
  const exp = typeof claims.exp === "number" ? claims.exp : 0;
  if (exp && exp * 1000 < Date.now()) return json({ error: "LINE id_token 已過期" }, 400);

  const lineSub = String(claims.sub || "");
  if (!lineSub) return json({ error: "LINE id_token 缺少 sub" }, 400);

  const displayName = (claims.name as string) || "LINE 使用者";
  const picture = (claims.picture as string) || null;
  const lineEmail = (claims.email as string) || null;
  // Synthetic email when LINE didn't grant email scope. Stable per LINE sub.
  const email = lineEmail || `line_${lineSub}@line.lakeze.local`;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 3. Find or create user ──────────────────────────────────────────────
  // Use GoTrue admin REST to look up by email (supabase-js has no
  // getUserByEmail helper).
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
    provider: "line",
    line_sub: lineSub,
    name: displayName,
    avatar_url: picture,
    last_reactivated_at: new Date().toISOString(),
    reactivated_via: "line",
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
    // Refresh metadata in case display name / avatar changed.
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: reactivationMetadata,
    });
  }

  // Recreate/reactivate public profile data. Current schema has no deleted/status
  // columns; if those are added later this base upsert remains safe.
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

  // Upsert platform_members so member center has a row immediately.
  try {
    await admin.from("platform_members").upsert(
      {
        user_id: userId,
        name: displayName,
        email: lineEmail,
        avatar_url: picture,
      },
      { onConflict: "user_id" },
    );
  } catch (err) {
    console.warn("platform_members upsert failed (table may not exist yet)", err);
  }

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
