import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const disconnect = read("supabase/functions/google-business-profile-disconnect/index.ts");
const shared = read("supabase/functions/_shared/gbp.ts");
const autoSync = read("supabase/functions/auto-sync-google-reviews/index.ts");
const oauthStart = read("supabase/functions/google-business-profile-oauth-start/index.ts");
const callback = read("supabase/functions/google-business-profile-oauth-callback/index.ts");
const ui = read("src/components/website-content/GoogleBusinessProfileSettings.tsx");

describe("Phase 2F — disconnect contract", () => {
  it("authorizes before Vault read / revoke / delete / DB update", () => {
    const auth = disconnect.indexOf("authorizeAccommodation(req");
    const vaultRead = disconnect.indexOf("vaultGet(admin, secretName)");
    const revoke = disconnect.lastIndexOf("GOOGLE_REVOKE_ENDPOINT");
    const vaultDel = disconnect.indexOf("vaultDelete(admin, secretName)");
    const update = disconnect.indexOf('connection_status: "NOT_CONFIGURED"');
    expect(auth).toBeGreaterThan(-1);
    expect(auth).toBeLessThan(vaultRead);
    expect(vaultRead).toBeLessThan(revoke);
    expect(revoke).toBeLessThan(vaultDel);
    expect(vaultDel).toBeLessThan(update);
    expect(disconnect).not.toContain("is_admin_or_super");
  });

  it("derives the Vault key server-side from the accommodation id only", () => {
    expect(disconnect).toContain("refreshTokenSecretName(accommodationId)");
    expect(disconnect).not.toMatch(/body\.(secretName|refreshToken|vaultKey)/);
  });

  it("treats Google revoke as best effort (already revoked / 5xx / throw)", () => {
    expect(disconnect).toContain("revokeStatus");
    expect(disconnect).toContain('r.ok ? "REVOKED" : "REVOKE_FAILED"');
    // failure paths still fall through to vault delete + metadata update
    const revokeFailIdx = disconnect.indexOf('revokeStatus = "REVOKE_FAILED"');
    const vaultDel = disconnect.indexOf("vaultDelete(admin, secretName)");
    expect(revokeFailIdx).toBeLessThan(vaultDel);
    expect(disconnect).not.toMatch(/return .*revoke_failed/i);
  });

  it("removes the local refresh token and logs no token material", () => {
    expect(disconnect).toContain("await vaultDelete(admin, secretName)");
    expect(disconnect).not.toMatch(/console\.(log|warn|error)\([^)]*(refreshToken|token,|accessToken|clientSecret)/);
  });

  it("is idempotent when no Vault token exists", () => {
    expect(disconnect).toContain("if (refreshToken) {");
    expect(disconnect).toContain('"SKIPPED"');
  });

  it("fails closed on DB error or 0 affected rows", () => {
    expect(disconnect).toContain('.select("accommodation_id")');
    expect(disconnect).toContain("affected.length !== 1");
    expect(disconnect).toContain("GBP_DISCONNECT_NO_ROW");
  });

  it("never deletes candidate reviews or frontend cache", () => {
    expect(disconnect).not.toMatch(/accommodation_google_business_reviews|google_reviews_cache|google_reviews_selected_keys|google_reviews_display_count|accommodation_info/);
    expect(disconnect).not.toMatch(/\.delete\(\)/);
  });

  it("preserves review_source (no silent Places fallback)", () => {
    expect(disconnect).not.toContain('review_source: "PLACES"');
    expect(disconnect).not.toMatch(/review_source:/);
  });

  it("clears only connection metadata", () => {
    for (const f of [
      'connection_status: "NOT_CONFIGURED"',
      "account_id: null",
      "location_id: null",
      "selected_account_name: null",
      "selected_location_name: null",
      "selected_location_title: null",
      "oauth_connected_at: null",
    ]) expect(disconnect).toContain(f);
  });
});

describe("Phase 2F — token expiry contract", () => {
  it("marks TOKEN_EXPIRED only for explicit credential invalidation", () => {
    expect(shared).toContain('code === "invalid_grant"');
    expect(shared).toContain('code === "invalid_token"');
    expect(shared).toContain("/revoked|expired or revoked/i.test(description)");
    expect(shared).toContain('connection_status: "TOKEN_EXPIRED"');
  });

  it("never maps transient errors (5xx / 429 / network) to TOKEN_EXPIRED", () => {
    expect(shared).toContain("r.status < 500 && r.status !== 429");
    expect(shared).toMatch(/catch \{\s*\/\/ Network failure[\s\S]*GBP_TOKEN_REFRESH_FAILED/);
  });

  it("token expiry never deletes candidates, cache, or switches to Places", () => {
    expect(shared).not.toMatch(/google_reviews_cache|accommodation_google_business_reviews/);
    expect(shared).not.toContain('review_source');
  });

  it("rotates the refresh token in place without leaving duplicates", () => {
    expect(shared).toContain("json.refresh_token !== refreshToken");
    expect(shared).toContain("await vaultSet(");
    expect(callback).toContain("refreshTokenSecretName(stateRow.accommodation_id)");
    expect(callback).toContain("if (!tokens.refreshToken) {");
  });
});

describe("Phase 2F — reconnect", () => {
  it("re-authorize reuses the audited oauth-start flow", () => {
    expect(ui).toContain("重新授權");
    expect(ui.match(/google-business-profile-oauth-start/g) ?? []).toHaveLength(1);
    expect(oauthStart).toContain("code_challenge_method");
  });

  it("does not trust the previously stored account/location after reauth", () => {
    expect(callback).toContain('connection_status: "READY_FOR_OAUTH"');
  });
});

describe("Phase 2F — auto-sync guard", () => {
  it("only syncs GBP accommodations that are CONNECTED", () => {
    expect(autoSync).toContain('g.connection_status === "CONNECTED"');
  });

  it("never falls back to Places for BUSINESS_PROFILE accommodations", () => {
    expect(autoSync).toContain("if (gbpIds.has(r.id)) return false;");
  });

  it("does not write frontend caches itself", () => {
    expect(autoSync).not.toMatch(/google_reviews_cache:|google_reviews_selected_keys|google_reviews_display_count|\.update\(|\.upsert\(/);
  });
});

describe("Phase 2F — UX", () => {
  it("TOKEN_EXPIRED shows a reauthorize CTA, not ID entry", () => {
    expect(ui).toContain("重新授權 Google 商家");
    expect(ui).toContain("不需要重新填寫任何 ID");
  });

  it("NOT_CONFIGURED shows the self-service connect CTA", () => {
    expect(ui).toContain("連結 Google 商家帳號");
    expect(ui).toContain("尚未連結 Google 商家帳號");
  });

  it("disconnect confirmation states the four guarantees", () => {
    for (const line of [
      "將停止新的 Business Profile 評論同步",
      "現有候選評論不會被刪除",
      "已套用至網站的評論不會消失",
      "可隨時重新連線",
    ]) expect(ui).toContain(line);
  });
});
