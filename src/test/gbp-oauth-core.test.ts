/**
 * Phase 2B OAuth Core source-contract tests (no production calls).
 *
 * Pins: PKCE S256, fail-closed ordering, callback state validation,
 * redirect-URI shape and absence of secret/token leakage.
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
const callback = read(
  "supabase/functions/google-business-profile-oauth-callback/index.ts",
);
const shared = read("supabase/functions/_shared/gbp.ts");

describe("PKCE", () => {
  it("oauth-start generates verifier + S256 challenge", () => {
    expect(oauthStart).toContain("const codeVerifier = randomToken(48)");
    expect(oauthStart).toContain('"SHA-256"');
    expect(oauthStart).toContain('url.searchParams.set("code_challenge_method", "S256")');
    expect(oauthStart).toContain('url.searchParams.set("code_challenge", challenge)');
  });

  it("verifier is persisted server-side only, never returned to the client", () => {
    expect(oauthStart).toContain("code_verifier: codeVerifier");
    expect(oauthStart).toMatch(/jsonResp\(\{ authorizationUrl: url\.toString\(\) \}\)/);
    expect(oauthStart).not.toMatch(/jsonResp\([^)]*codeVerifier/);
  });

  it("callback exchanges using the stored verifier", () => {
    expect(callback).toContain("codeVerifier: stateRow.code_verifier");
    expect(shared).toContain('body.set("code_verifier", params.codeVerifier)');
  });
});

describe("oauth-start fail-closed ordering", () => {
  it("validates platform config before creating any state row", () => {
    const cfgIdx = oauthStart.indexOf("GBP_PLATFORM_NOT_CONFIGURED");
    const insertIdx = oauthStart.indexOf(".insert({");
    expect(cfgIdx).toBeGreaterThan(-1);
    expect(cfgIdx).toBeLessThan(insertIdx);
  });

  it("cross-accommodation / readonly callers are denied by authorizeAccommodation", () => {
    expect(oauthStart).toContain("authorizeAccommodation(req, accommodationId)");
    expect(shared).toContain('canEditModule(\n    resolved.ctx,\n    accommodationId,\n    "website_content",\n  )');
    expect(shared).toContain('{ ok: false, status: 403, error: "Forbidden" }');
  });
});

describe("oauth-callback negative paths", () => {
  it("rejects missing / unknown / expired / used state and missing code", () => {
    expect(callback).toContain("if (!state) return fallbackPage");
    expect(callback).toContain("if (!stateRow) return fallbackPage");
    expect(callback).toContain("if (stateRow.used_at) return fallbackPage");
    expect(callback).toContain("new Date(stateRow.expires_at).getTime() < Date.now()");
    expect(callback).toContain('if (!code) {');
  });

  it("claims the state one-time before any token exchange", () => {
    const claimIdx = callback.indexOf('.is("used_at", null)');
    const exchangeIdx = callback.indexOf("exchangeCode(");
    expect(claimIdx).toBeGreaterThan(-1);
    expect(claimIdx).toBeLessThan(exchangeIdx);
  });

  it("error redirects carry only a safe status code", () => {
    expect(callback).toContain("`${target}?gbp_oauth=${status}`");
    expect(callback).not.toMatch(/gbp_oauth=\$\{(code|state|token)/);
    expect(callback).not.toMatch(/Location:\s*`[^`]*\$\{code\}/);
  });
});

describe("no secret / token exposure", () => {
  for (const [name, src] of Object.entries({ saveSecret, oauthStart, callback })) {
    it(`${name} never logs code / token / secret material`, () => {
      const logs = src.match(/console\.(log|info|warn|error)\([^)]*\)/g) ?? [];
      for (const line of logs) {
        expect(line).not.toMatch(/code|token|secret|verifier/i);
      }
      expect(src).not.toMatch(/jsonResp\([^)]*clientSecret/);
      expect(src).not.toMatch(/jsonResp\([^)]*refreshToken/);
      expect(src).not.toMatch(/jsonResp\([^)]*accessToken/);
    });
  }
});

describe("redirect uri", () => {
  it("callback redirect uri is the functions/v1 callback path", () => {
    expect(shared).toContain(
      "`${base}/functions/v1/google-business-profile-oauth-callback`",
    );
  });
});
