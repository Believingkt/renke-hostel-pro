/**
 * Phase 2A backend security guards (source-level, no production calls).
 *
 * These tests pin the security contract of the Google Business Profile
 * platform-secret and OAuth-start edge functions:
 *  - super_admin only authorization, performed BEFORE any secret handling
 *  - the client secret is never logged, echoed, or persisted in a public table
 *  - OAuth start fails closed with GBP_PLATFORM_NOT_CONFIGURED before any
 *    oauth_states row is created
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const saveSecret = read(
  "supabase/functions/save-google-business-profile-platform-secret/index.ts",
);
const oauthStart = read(
  "supabase/functions/google-business-profile-oauth-start/index.ts",
);
const shared = read("supabase/functions/_shared/gbp.ts");
const authz = read("supabase/functions/_shared/authz.ts");

describe("save-google-business-profile-platform-secret", () => {
  it("authorizes with exact super_admin only", () => {
    expect(saveSecret).toContain("isSuperAdmin(resolved.ctx)");
    expect(saveSecret).not.toContain("is_admin_or_super");
    expect(saveSecret).not.toContain("hotel_admin");
    expect(saveSecret).not.toContain("canEditModule");
  });

  it("isSuperAdmin only accepts the super_admin role or service-role", () => {
    const fn = authz.slice(authz.indexOf("export function isSuperAdmin"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain('includes("super_admin")');
    expect(body).not.toContain("hotel_admin");
  });

  it("resolves + authorizes the caller before reading the secret body", () => {
    const authIdx = saveSecret.indexOf("isSuperAdmin");
    const bodyIdx = saveSecret.indexOf("body.clientSecret");
    const vaultIdx = saveSecret.indexOf("vaultSet(");
    expect(authIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(bodyIdx);
    expect(authIdx).toBeLessThan(vaultIdx);
  });

  it("never logs or returns the secret", () => {
    expect(saveSecret).not.toMatch(/console\.(log|info|warn|error)/);
    expect(saveSecret).not.toMatch(/clientSecret\s*[,}]/);
    // Only a boolean flag is persisted / returned.
    expect(saveSecret).toContain("client_secret_configured: true");
    expect(saveSecret).toContain("{ configured: true }");
  });

  it("stores the secret only through the vault wrapper", () => {
    expect(saveSecret).toContain("vaultSet(admin, PLATFORM_SECRET_NAME, secret)");
    expect(shared).toContain('admin.rpc("gbp_vault_set"');
  });
});

describe("google-business-profile-oauth-start fail-closed", () => {
  it("returns GBP_PLATFORM_NOT_CONFIGURED before creating any state row", () => {
    const guardIdx = oauthStart.indexOf("GBP_PLATFORM_NOT_CONFIGURED");
    const insertIdx = oauthStart.indexOf(
      "google_business_profile_oauth_states",
    );
    const googleUrlIdx = oauthStart.indexOf("GOOGLE_AUTH_ENDPOINT)");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(insertIdx);
    expect(guardIdx).toBeLessThan(googleUrlIdx);
  });

  it("requires client id, configured secret and a non-rejected access status", () => {
    expect(oauthStart).toContain("!cfg?.oauth_client_id");
    expect(oauthStart).toContain("!cfg.client_secret_configured");
    expect(oauthStart).toContain('cfg.api_access_status === "REJECTED"');
  });

  it("authorizes the caller before touching platform config", () => {
    const authIdx = oauthStart.indexOf("authorizeAccommodation(");
    const cfgIdx = oauthStart.indexOf("getPlatformConfig(admin)");
    expect(authIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(cfgIdx);
  });

  it("restricts OAuth return URLs to trusted https hosts", () => {
    expect(oauthStart).toContain('u.protocol !== "https:"');
    expect(oauthStart).toContain("ALLOWED_RETURN_HOSTS");
  });
});
