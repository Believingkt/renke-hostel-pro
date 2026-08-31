// Shared helpers for the Google Business Profile integration.
//
// SECURITY CONTRACT
//  - OAuth client secret and per-accommodation refresh tokens live ONLY in
//    Supabase Vault, reachable through the service-role-only SECURITY DEFINER
//    wrappers `public.gbp_vault_set / gbp_vault_get / gbp_vault_delete`.
//  - Access tokens are never persisted: they exist only in request memory.
//  - Never log authorization codes, tokens, or the client secret.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { resolveCaller, canEditModule, type AuthContext } from "./authz.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export const PLATFORM_SECRET_NAME =
  "google_business_profile_oauth_client_secret";

export const refreshTokenSecretName = (accommodationId: string) =>
  `google_business_profile_refresh_token_${accommodationId}`;

export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/business.manage";
export const GOOGLE_AUTH_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function callbackRedirectUri(): string {
  const base = Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "");
  return `${base}/functions/v1/google-business-profile-oauth-callback`;
}

export interface PlatformConfig {
  project_id: string | null;
  project_number: string | null;
  oauth_client_id: string | null;
  api_access_status: string;
  client_secret_configured: boolean;
  redirect_uri: string | null;
}

export async function getPlatformConfig(
  admin: any,
): Promise<PlatformConfig | null> {
  const { data } = await admin
    .from("google_business_profile_platform_config")
    .select(
      "project_id, project_number, oauth_client_id, api_access_status, client_secret_configured, redirect_uri",
    )
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as PlatformConfig) ?? null;
}

export async function vaultGet(
  admin: any,
  name: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc("gbp_vault_get", { p_name: name });
  if (error) return null;
  return (data as string | null) ?? null;
}

export async function vaultSet(admin: any, name: string, value: string) {
  const { error } = await admin.rpc("gbp_vault_set", {
    p_name: name,
    p_value: value,
  });
  if (error) throw new Error("vault_write_failed");
}

export async function vaultDelete(admin: any, name: string) {
  await admin.rpc("gbp_vault_delete", { p_name: name });
}

/**
 * Authorization contract shared by every per-accommodation GBP endpoint:
 * super_admin OR hotel_admin of the accommodation OR staff with `website_content`
 * set to editable. Readonly staff and cross-accommodation callers are denied.
 */
export async function authorizeAccommodation(
  req: Request,
  accommodationId: string,
): Promise<
  { ok: true; ctx: AuthContext } | { ok: false; status: number; error: string }
> {
  const resolved = await resolveCaller(req);
  if (!resolved.ok) return resolved;
  const allowed = await canEditModule(
    resolved.ctx,
    accommodationId,
    "website_content",
  );
  if (!allowed) return { ok: false, status: 403, error: "Forbidden" };
  return { ok: true, ctx: resolved.ctx };
}

export interface TokenResult {
  accessToken: string;
  refreshToken?: string | null;
}

/** Exchange an authorization code for tokens. Never logs the payload. */
export async function exchangeCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  codeVerifier?: string | null;
}): Promise<TokenResult> {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });
  if (params.codeVerifier) body.set("code_verifier", params.codeVerifier);

  const r = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error("token_exchange_failed");
  const json = await r.json();
  if (!json.access_token) throw new Error("token_exchange_failed");
  return { accessToken: json.access_token, refreshToken: json.refresh_token };
}

export class GbpError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400, message?: string) {
    super(message ?? code);
    this.code = code;
    this.status = status;
  }
}

/**
 * Resolve a short-lived access token for an accommodation.
 * Reads the refresh token from Vault, refreshes it against Google and rotates
 * the stored refresh token when Google returns a new one.
 * On `invalid_grant` the connection is marked TOKEN_EXPIRED.
 */
export async function getGoogleBusinessProfileAccessToken(
  admin: any,
  accommodationId: string,
): Promise<string> {
  const cfg = await getPlatformConfig(admin);
  if (!cfg?.oauth_client_id || !cfg.client_secret_configured) {
    throw new GbpError("GBP_PLATFORM_NOT_CONFIGURED", 400);
  }
  const clientSecret = await vaultGet(admin, PLATFORM_SECRET_NAME);
  if (!clientSecret) throw new GbpError("GBP_PLATFORM_NOT_CONFIGURED", 400);

  const refreshToken = await vaultGet(
    admin,
    refreshTokenSecretName(accommodationId),
  );
  if (!refreshToken) throw new GbpError("GBP_NOT_CONNECTED", 400);

  let r: Response;
  try {
    r = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.oauth_client_id,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
  } catch {
    // Network failure / timeout is transient — never a credential problem.
    throw new GbpError("GBP_TOKEN_REFRESH_FAILED", 502);
  }

  if (!r.ok) {
    let code = "token_refresh_failed";
    let description = "";
    try {
      const err = await r.json();
      code = String(err?.error ?? code);
      description = String(err?.error_description ?? "");
    } catch { /* ignore */ }
    // ONLY an explicit credential-invalid response marks the connection
    // expired. 429 / 5xx / timeouts stay transient.
    const credentialInvalid = code === "invalid_grant" ||
      code === "invalid_token" ||
      /revoked|expired or revoked/i.test(description);
    if (credentialInvalid && r.status < 500 && r.status !== 429) {
      await admin
        .from("accommodation_google_business_profile")
        .update({ connection_status: "TOKEN_EXPIRED" })
        .eq("accommodation_id", accommodationId);
      throw new GbpError("GBP_TOKEN_EXPIRED", 401);
    }
    throw new GbpError("GBP_TOKEN_REFRESH_FAILED", 502);
  }

  const json = await r.json();
  if (json.refresh_token && json.refresh_token !== refreshToken) {
    await vaultSet(
      admin,
      refreshTokenSecretName(accommodationId),
      json.refresh_token,
    );
  }
  if (!json.access_token) throw new GbpError("GBP_TOKEN_REFRESH_FAILED", 502);
  return json.access_token as string;
}
