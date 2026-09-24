import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const start = readFileSync(
  "supabase/functions/google-business-profile-oauth-start/index.ts",
  "utf8",
);
const callback = readFileSync(
  "supabase/functions/google-business-profile-oauth-callback/index.ts",
  "utf8",
);
const shared = readFileSync("supabase/functions/_shared/gbp.ts", "utf8");
const ui = readFileSync(
  "apps/pms/src/components/website-content/GoogleBusinessProfileSettings.tsx",
  "utf8",
);

/** Strip comments so contract assertions test executable code, not prose. */
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const startCode = codeOnly(start);
const callbackCode = codeOnly(callback);

describe("P3｜oauth-start credential source", () => {
  it("使用該館 oauth_client_id 作為 OAuth client", () => {
    expect(startCode).toContain("getAccommodationOAuthConfig(admin, accommodationId)");
    expect(startCode).toContain('url.searchParams.set("client_id", cfg.oauth_client_id.trim())');
  });

  it("不依賴 global platform config / PLATFORM_SECRET_NAME", () => {
    expect(startCode).not.toContain("getPlatformConfig");
    expect(startCode).not.toContain("google_business_profile_platform_config");
    expect(startCode).not.toContain("PLATFORM_SECRET_NAME");
    expect(startCode).not.toContain("GBP_PLATFORM_NOT_CONFIGURED");
  });

  it("授權為 strict admin only（super_admin / 本館 hotel_admin）", () => {
    expect(startCode).toContain("isAccommodationAdmin(resolved.ctx, accommodationId)");
    expect(startCode).not.toContain("authorizeAccommodation");
    expect(startCode).not.toContain("canEditModule");
    expect(startCode).not.toContain("is_admin_or_super");
  });

  it("授權先於 Vault 讀取 / state INSERT / Google URL 產生", () => {
    const authAt = startCode.indexOf("isAccommodationAdmin");
    expect(authAt).toBeGreaterThan(-1);
    expect(authAt).toBeLessThan(startCode.indexOf("getAccommodationOAuthConfig"));
    expect(authAt).toBeLessThan(startCode.indexOf("google_business_profile_oauth_states"));
    expect(authAt).toBeLessThan(startCode.indexOf("GOOGLE_AUTH_ENDPOINT"));
  });

  it("readiness：缺 client id / secret 未設定 / 未 APPROVED 皆擋下", () => {
    expect(startCode).toContain("GBP_ACCOMMODATION_NOT_CONFIGURED");
    expect(startCode).toContain("GBP_ACCOMMODATION_SECRET_NOT_CONFIGURED");
    expect(startCode).toContain("GBP_ACCOMMODATION_API_NOT_APPROVED");
    expect(startCode).toContain('cfg.application_status !== "APPROVED"');
    expect(startCode).toContain("!cfg.client_secret_configured");
    const readyAt = startCode.indexOf("GBP_ACCOMMODATION_API_NOT_APPROVED");
    expect(readyAt).toBeLessThan(startCode.indexOf("google_business_profile_oauth_states"));
  });

  it("Project ID / Number 不得作為 OAuth 參數", () => {
    expect(startCode).not.toContain("project_number");
    expect(startCode).not.toMatch(/searchParams\.set\([^)]*project_id/);
  });

  it("redirect_uri 使用共用固定 callbackRedirectUri()", () => {
    expect(startCode).toContain('url.searchParams.set("redirect_uri", callbackRedirectUri())');
    expect(startCode).not.toContain("cfg.redirect_uri");
  });

  it("PKCE S256 + 10 分鐘一次性 state，且不存任何密鑰", () => {
    expect(startCode).toContain('code_challenge_method", "S256"');
    expect(startCode).toContain("10 * 60_000");
    expect(startCode).toContain("code_verifier: codeVerifier");
    expect(startCode).not.toMatch(/insert\(\{[\s\S]*?(client_secret|refresh_token|access_token)/);
  });
});

describe("P3｜oauth-callback tenant binding 與權限重驗", () => {
  it("accommodation 只能來自 validated state", () => {
    expect(callbackCode).toContain("const accommodationId: string = stateRow.accommodation_id");
    expect(callbackCode).not.toMatch(/searchParams\.get\(\s*["']accommodation/);
    expect(callbackCode).not.toContain("body.accommodation_id");
    expect(callbackCode).not.toContain("body.accommodationId");
  });

  it("交換 token 前重新確認 state.user_id 目前仍為 strict admin", () => {
    expect(callbackCode).toContain("isStrictAccommodationAdminUser(");
    expect(callbackCode).toContain("stateRow.user_id");
    expect(callbackCode).toContain('back("permission_changed")');
    expect(callbackCode.indexOf("isStrictAccommodationAdminUser(")).toBeLessThan(
      callbackCode.indexOf("await exchangeCode({"),
    );
    expect(callbackCode).not.toContain("is_admin_or_super");
  });

  it("state 未知 / 已使用 / 已過期一律拒絕，且 claim 為一次性", () => {
    expect(callbackCode).toContain("if (!stateRow) return fallbackPage");
    expect(callbackCode).toContain("if (stateRow.used_at) return fallbackPage");
    expect(callbackCode).toContain("new Date(stateRow.expires_at).getTime() < Date.now()");
    expect(callbackCode).toContain('.is("used_at", null)');
    expect(callbackCode).toContain("if (!state) return fallbackPage");
  });

  it("使用該館 Client Secret Vault，無 global fallback", () => {
    expect(callbackCode).toContain("getAccommodationOAuthClientSecret(");
    expect(callbackCode).not.toContain("PLATFORM_SECRET_NAME");
    expect(callbackCode).not.toContain("getPlatformConfig");
    expect(callbackCode).not.toContain("google_business_profile_platform_config");
  });

  it("token exchange 使用該館 client id、共用 redirect URI、state 的 PKCE verifier", () => {
    expect(callbackCode).toContain("clientId: cfg.oauth_client_id.trim()");
    expect(callbackCode).toContain("redirectUri: callbackRedirectUri()");
    expect(callbackCode).toContain("codeVerifier: stateRow.code_verifier");
  });

  it("refresh token 只寫該館 key，且不回傳前端", () => {
    expect(callbackCode).toContain("refreshTokenSecretName(accommodationId)");
    expect(callbackCode).toContain("vaultSet(admin, refreshKey, tokens.refreshToken)");
    expect(callbackCode).not.toMatch(/refresh_token[^)]*JSON\.stringify/);
    expect(callbackCode).not.toMatch(/\?gbp_oauth=\$\{status\}[^`]*token/);
  });

  it("首次連線無 refresh token → FAIL；重新授權無新 token 但已有舊 token → 保留", () => {
    expect(callbackCode).toContain("const existing = await vaultGet(admin, refreshKey)");
    expect(callbackCode).toContain('if (!existing) return back("no_refresh_token")');
    // 舊 token 不得在缺少新 token 時被刪除
    expect(callbackCode).not.toContain("vaultDelete");
  });

  it("callback 成功只設 READY_FOR_OAUTH，不得設 CONNECTED", () => {
    expect(callbackCode).toContain('connection_status: "READY_FOR_OAUTH"');
    expect(callbackCode).not.toContain('"CONNECTED"');
  });

  it("錯誤導回只帶安全狀態，不帶 code / state / secret / token", () => {
    expect(callbackCode).toContain("gbp_oauth=${status}");
    expect(callbackCode).not.toMatch(/gbp_oauth=[^`]*\$\{(code|state|clientSecret|tokens)/);
    expect(callbackCode).not.toMatch(/console\.(log|error|warn)\([^)]*(code|token|secret|clientSecret)/);
  });
});

describe("P3｜shared helper 與凍結範圍", () => {
  it("helper 存在且 Vault key 由後端推導", () => {
    expect(shared).toContain("export async function getAccommodationOAuthConfig(");
    expect(shared).toContain("export async function getAccommodationOAuthClientSecret(");
    expect(shared).toContain(
      "`google_business_profile_oauth_client_secret_${accommodationId}`",
    );
  });

  it("client_secret_configured = false 時不得讀 Vault 當 runtime credential", () => {
    expect(shared).toContain("if (!config?.client_secret_configured) return null;");
  });

  it("getGoogleBusinessProfileAccessToken 已於 P4 切換為每館 credentials", () => {
    const fn = shared.slice(shared.indexOf("export async function getGoogleBusinessProfileAccessToken"));
    expect(fn).toContain("accommodationClientSecretName(accommodationId)");
    expect(fn).toContain("refreshTokenSecretName(accommodationId)");
    expect(fn).not.toContain("getPlatformConfig(admin)");
    expect(fn).not.toContain("PLATFORM_SECRET_NAME");
  });


  it("Connect Google 已於 P5 啟用，且由每館 readiness 把關", () => {
    expect(ui).toContain("const OAUTH_RUNTIME_READY = true");
    expect(ui).toContain("isAccommodationGoogleOAuthReady");
  });
});
