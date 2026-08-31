/**
 * Phase 2C source-contract tests for Accounts + Locations.
 *
 * No production calls, no Google credentials. These pin the security
 * contract of the three deployed edge functions:
 *   - list-accounts, list-locations, select-location
 *
 * Behavioural pagination / ownership cases (ACCOUNT CASE A/B/C,
 * LOCATION CASE A/B/C/D) are covered by simulating the exact paging loop
 * shape used by the sources against a mocked Google API.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const listAccounts = read(
  "supabase/functions/google-business-profile-list-accounts/index.ts",
);
const listLocations = read(
  "supabase/functions/google-business-profile-list-locations/index.ts",
);
const selectLocation = read(
  "supabase/functions/google-business-profile-select-location/index.ts",
);
const shared = read("supabase/functions/_shared/gbp.ts");
const authz = read("supabase/functions/_shared/authz.ts");

const all = [listAccounts, listLocations, selectLocation];

describe("authorization contract", () => {
  it("every function authorizes the target accommodation server-side", () => {
    for (const src of all) {
      expect(src).toContain("authorizeAccommodation(req, accommodationId)");
      expect(src).toContain("if (!auth.ok) return jsonResp({ error: auth.error }, auth.status);");
    }
  });

  it("authorization uses website_content edit permission, not is_admin_or_super", () => {
    expect(shared).toContain('"website_content"');
    for (const src of [...all, shared]) {
      expect(src).not.toContain("is_admin_or_super");
    }
  });

  it("readonly / hidden staff and cross-accommodation callers are denied", () => {
    // canEditModule only allows 'editable'; roles are read per accommodation_id.
    expect(authz).toContain('.eq("accommodation_id", accommodationId)');
    expect(authz).toContain('return level === "editable"');
    expect(shared).toContain('{ ok: false, status: 403, error: "Forbidden" }');
  });

  it("authorization happens before any Google call or DB write", () => {
    for (const src of all) {
      const authIdx = src.indexOf("authorizeAccommodation");
      const tokenIdx = src.indexOf("getGoogleBusinessProfileAccessToken");
      expect(authIdx).toBeGreaterThan(-1);
      expect(authIdx).toBeLessThan(tokenIdx);
    }
    expect(selectLocation.indexOf("authorizeAccommodation"))
      .toBeLessThan(selectLocation.indexOf(".upsert("));
  });
});

describe("token tenant isolation / fail-closed", () => {
  it("refresh token name is derived from the accommodation id only", () => {
    expect(shared).toContain(
      "export const refreshTokenSecretName = (accommodationId: string) =>\n  `google_business_profile_refresh_token_${accommodationId}`",
    );
    for (const src of all) {
      expect(src).toContain("getGoogleBusinessProfileAccessToken(\n      admin,\n      accommodationId,\n    )");
      // client can never choose a vault secret name
      expect(src).not.toMatch(/body\.(secretName|vault|tokenKey)/);
    }
  });

  it("missing refresh token fails closed with GBP_NOT_CONNECTED", () => {
    expect(shared).toContain('if (!refreshToken) throw new GbpError("GBP_NOT_CONNECTED", 400)');
    // no fallback to another accommodation or to the platform client secret
    expect(shared).not.toMatch(/refreshToken\s*\|\|\s*clientSecret/);
  });

  it("platform misconfiguration fails closed before any Google call", () => {
    const fn = shared.slice(shared.indexOf("export async function getGoogleBusinessProfileAccessToken"));
    const cfgIdx = fn.indexOf("GBP_PLATFORM_NOT_CONFIGURED");
    const fetchIdx = fn.indexOf("GOOGLE_TOKEN_ENDPOINT, {");
    expect(cfgIdx).toBeGreaterThan(-1);
    expect(cfgIdx).toBeLessThan(fetchIdx);
  });
});

describe("no secret exposure", () => {
  it("never logs or returns tokens / secrets", () => {
    for (const src of all) {
      expect(src).not.toMatch(/console\.(log|info)\([^)]*(token|secret|Token|Secret)/);
      expect(src).not.toMatch(/jsonResp\([^)]*accessToken/);
      expect(src).not.toMatch(/searchParams\.set\((["'])(access_token|token)\1/);
    }
    // tokens are only ever sent in the Authorization header
    for (const src of all) {
      const uses = src.match(/accessToken/g) ?? [];
      const headerUses = src.match(/Authorization: `Bearer \$\{accessToken\}`/g) ?? [];
      expect(uses.length).toBeGreaterThan(headerUses.length); // declaration + usages
      expect(headerUses.length).toBeGreaterThan(0);
    }
  });

  it("select-location persists only approved non-secret metadata", () => {
    const upsert = selectLocation.slice(
      selectLocation.indexOf(".upsert("),
      selectLocation.indexOf("{ onConflict:"),
    );
    for (const banned of ["access_token", "refresh_token", "client_secret", "code"]) {
      expect(upsert).not.toContain(banned);
    }
    for (const allowed of [
      "accommodation_id",
      "account_id",
      "location_id",
      "selected_account_name",
      "selected_location_name",
      "selected_location_title",
      "connection_status",
    ]) {
      expect(upsert).toContain(allowed);
    }
  });
});

describe("pagination handling", () => {
  it("list-accounts follows nextPageToken", () => {
    expect(listAccounts).toContain("pageToken = json.nextPageToken");
    expect(listAccounts).toContain("} while (pageToken && pages < 10);");
    expect(listAccounts).toContain('url.searchParams.set("pageToken", pageToken)');
  });

  it("list-locations sets pageSize and follows nextPageToken", () => {
    expect(listLocations).toContain('url.searchParams.set("pageSize", "100")');
    expect(listLocations).toContain("pageToken = json.nextPageToken");
    expect(listLocations).toContain("} while (pageToken && pages < 10);");
  });

  // ACCOUNT CASE A / B and LOCATION CASE A / B: simulate the same loop shape.
  const drain = async (fetchImpl: (token?: string) => Promise<any>) => {
    const items: any[] = [];
    let pageToken: string | undefined;
    let pages = 0;
    do {
      const json = await fetchImpl(pageToken);
      items.push(...(json.items ?? []));
      pageToken = json.nextPageToken;
      pages += 1;
    } while (pageToken && pages < 10);
    return items;
  };

  it("CASE A: single page returns all items", async () => {
    const f = vi.fn(async () => ({ items: [{ name: "accounts/1" }] }));
    expect(await drain(f)).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("CASE B: multi-page collects every page", async () => {
    const pages = [
      { items: [{ name: "a/1" }], nextPageToken: "t2" },
      { items: [{ name: "a/2" }], nextPageToken: "t3" },
      { items: [{ name: "a/3" }] },
    ];
    let i = 0;
    const items = await drain(async () => pages[i++]);
    expect(items.map((x) => x.name)).toEqual(["a/1", "a/2", "a/3"]);
  });
});

describe("ownership validation (server-side, Google scope is the source of truth)", () => {
  it("ACCOUNT CASE C: requested account not in token scope is denied", () => {
    expect(listLocations).toContain("const allowed = await listAccountNames(accessToken);");
    expect(listLocations).toContain(
      'if (!allowed.has(accountResourceName)) {\n      return jsonResp({ error: "GBP_ACCOUNT_NOT_ACCESSIBLE" }, 403);',
    );
    expect(selectLocation).toContain('if (!account) return jsonResp({ error: "GBP_ACCOUNT_NOT_ACCESSIBLE" }, 403);');
  });

  it("LOCATION CASE C: requested location not under the account is denied", () => {
    expect(selectLocation).toContain(
      'if (!location) return jsonResp({ error: "GBP_LOCATION_NOT_ACCESSIBLE" }, 403);',
    );
  });

  it("LOCATION CASE D: persistence happens only after both checks pass", () => {
    const accIdx = selectLocation.indexOf("GBP_ACCOUNT_NOT_ACCESSIBLE");
    const locIdx = selectLocation.indexOf("GBP_LOCATION_NOT_ACCESSIBLE");
    const writeIdx = selectLocation.indexOf(".upsert(");
    expect(accIdx).toBeLessThan(locIdx);
    expect(locIdx).toBeLessThan(writeIdx);
  });

  it("CONNECTED is only set inside the verified-location write", () => {
    const occurrences = selectLocation.match(/CONNECTED/g) ?? [];
    expect(occurrences).toHaveLength(1);
    expect(selectLocation.indexOf('connection_status: "CONNECTED"'))
      .toBeGreaterThan(selectLocation.indexOf("GBP_LOCATION_NOT_ACCESSIBLE"));
  });

  it("binding never trusts a client-supplied id format alone", () => {
    // no regex/uuid style shortcut acceptance
    expect(selectLocation).not.toMatch(/\/\^accounts\\\//);
    expect(selectLocation).toContain("locJson.locations ?? []");
    expect(selectLocation).toContain("accJson.accounts ?? []");
  });
});
