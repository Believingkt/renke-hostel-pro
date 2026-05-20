// LINE Login v2.1 (OIDC) authorization code -> id_token exchanger.
// Frontend posts { code, redirectUri, expectedNonce } and we:
//   1. POST to https://api.line.me/oauth2/v2.1/token
//   2. Decode id_token, verify nonce matches expectedNonce
//   3. Return id_token (and decoded claims) to the client so it can call
//      supabase.auth.signInWithIdToken({ provider: 'line', token, nonce })
//
// Required runtime secrets (Lovable Cloud Secrets):
//   - LINE_CHANNEL_ID
//   - LINE_CHANNEL_SECRET
//
// NOTE: state validation is done on the client (sessionStorage round-trip),
// since state never leaves the browser. We re-verify nonce server-side here
// as an extra safeguard before handing the id_token to Supabase.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface ExchangeBody {
  code?: string;
  redirectUri?: string;
  expectedNonce?: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const channelId = Deno.env.get("LINE_CHANNEL_ID");
  const channelSecret = Deno.env.get("LINE_CHANNEL_SECRET");

  if (!channelId || !channelSecret) {
    return jsonResponse(
      { error: "LINE 登入尚未設定，請先於 Lovable Cloud Secrets 填入 LINE_CHANNEL_ID 與 LINE_CHANNEL_SECRET" },
      500,
    );
  }

  let body: ExchangeBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "請求格式錯誤" }, 400);
  }

  const { code, redirectUri, expectedNonce } = body;
  if (!code || !redirectUri || !expectedNonce) {
    return jsonResponse({ error: "缺少必要參數（code / redirectUri / expectedNonce）" }, 400);
  }

  // 1. Exchange authorization code -> tokens
  const params = new URLSearchParams({
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
      body: params.toString(),
    });
    tokenJson = await resp.json();
    if (!resp.ok) {
      console.error("LINE token exchange failed", tokenJson);
      return jsonResponse(
        { error: tokenJson?.error_description || "LINE 登入授權碼交換失敗" },
        400,
      );
    }
  } catch (err) {
    console.error("LINE token endpoint error", err);
    return jsonResponse({ error: "無法連線到 LINE 登入服務，請稍後再試" }, 502);
  }

  const idToken: string | undefined = tokenJson.id_token;
  if (!idToken) {
    return jsonResponse({ error: "LINE 未回傳 id_token，請確認 channel 已啟用 OpenID Connect" }, 400);
  }

  // 2. Decode id_token (LINE issues over HTTPS so we trust transport; we still
  //    verify nonce + aud + iss claims).
  let claims: Record<string, unknown>;
  try {
    claims = decodeJwtPayload(idToken);
  } catch (err) {
    console.error("id_token decode failed", err);
    return jsonResponse({ error: "無法解析 LINE id_token" }, 400);
  }

  if (claims.iss !== "https://access.line.me") {
    return jsonResponse({ error: "id_token 簽發者不正確" }, 400);
  }
  if (claims.aud !== channelId) {
    return jsonResponse({ error: "id_token 對象不正確" }, 400);
  }
  if (claims.nonce !== expectedNonce) {
    return jsonResponse({ error: "nonce 驗證失敗，請重新登入" }, 400);
  }

  const exp = typeof claims.exp === "number" ? claims.exp : 0;
  if (exp && exp * 1000 < Date.now()) {
    return jsonResponse({ error: "LINE id_token 已過期，請重新登入" }, 400);
  }

  return jsonResponse({
    id_token: idToken,
    access_token: tokenJson.access_token ?? null,
    claims: {
      sub: claims.sub,
      name: claims.name ?? null,
      picture: claims.picture ?? null,
      email: claims.email ?? null,
    },
  });
});
