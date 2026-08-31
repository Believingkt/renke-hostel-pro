import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const fetchFn = read("supabase/functions/fetch-google-business-profile-reviews/index.ts");
const gbpShared = read("supabase/functions/_shared/gbp.ts");

describe("reviews sync contract (static source guarantees)", () => {
  it("uses the Business Profile reviews resource, not Places", () => {
    expect(fetchFn).toContain("mybusiness.googleapis.com/v4/${accountName}/${locationName}/reviews");
    expect(fetchFn).not.toMatch(/places\.googleapis|maps\.googleapis/i);
  });

  it("caps pageSize at 50 and follows nextPageToken", () => {
    expect(fetchFn).toContain('url.searchParams.set("pageSize", String(PAGE_SIZE))');
    expect(fetchFn).toContain("pageToken = json.nextPageToken");
  });

  it("authorizes before reading Vault tokens or calling Google", () => {
    const authIdx = fetchFn.indexOf("authorizeAccommodation(req");
    const tokenIdx = fetchFn.lastIndexOf("getGoogleBusinessProfileAccessToken");

    const writeIdx = fetchFn.indexOf(".upsert(finalRows");
    expect(authIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(tokenIdx);
    expect(tokenIdx).toBeLessThan(fetchIdx);
    expect(fetchIdx).toBeLessThan(writeIdx);
    expect(fetchFn).not.toContain("is_admin_or_super");
  });

  it("requires CONNECTED + bound account/location (fail closed)", () => {
    expect(fetchFn).toContain('cfg.connection_status !== "CONNECTED"');
    expect(fetchFn).toContain("GBP_LOCATION_NOT_SELECTED");
  });

  it("never lets the client override account/location/sync target", () => {
    expect(fetchFn).toContain("const accountName = cfg.selected_account_name");
    expect(fetchFn).toContain("const locationName = cfg.selected_location_name");
    expect(fetchFn).toContain("const syncTarget = cfg.sync_target");
    expect(fetchFn).not.toMatch(/body\.(accountName|locationName|syncTarget|secretName|refreshToken)/);
  });

  it("derives the Vault refresh token name from the accommodation id only", () => {
    expect(gbpShared).toContain(
      "export const refreshTokenSecretName = (accommodationId: string) =>",
    );
    expect(fetchFn).not.toContain("refreshTokenSecretName");
  });

  it("is UPSERT ONLY — no candidate deletes or cleanup", () => {
    expect(fetchFn).toContain('onConflict: "accommodation_id,review_name"');
    expect(fetchFn).not.toMatch(/\.delete\(\)|truncate/i);
  });

  it("never writes the public frontend review cache", () => {
    expect(fetchFn).not.toMatch(
      /google_reviews_cache|google_reviews_selected_keys|google_reviews_display_count|accommodation_info/,
    );
  });

  it("reports candidate_review_count from an actual DB count", () => {
    expect(fetchFn).toContain('{ count: "exact", head: true }');
    expect(fetchFn).toContain("candidate_review_count: count ?? finalRows.length");
  });

  it("flags PARTIAL when the ALL page cap is hit with a next page", () => {
    expect(fetchFn).toContain("const partial = pages >= MAX_PAGES && !!pageToken");
    expect(fetchFn).toContain('partial ? "PARTIAL" : "SUCCESS"');
  });

  it("stores only a safe error code, never raw Google responses", () => {
    expect(fetchFn).toContain("last_business_profile_sync_error: code");
    expect(fetchFn).not.toMatch(/last_business_profile_sync_error:\s*(text|json|e\.message)/);
  });

  it("marks TOKEN_EXPIRED on invalid_grant without clearing candidates", () => {
    expect(gbpShared).toContain('code === "invalid_grant"');
    expect(gbpShared).toContain('connection_status: "TOKEN_EXPIRED"');
    expect(gbpShared).toContain('throw new GbpError("GBP_TOKEN_EXPIRED", 401)');
    expect(gbpShared).not.toMatch(/accommodation_google_business_reviews/);
  });

  it("requires website_content edit rights (readonly staff denied)", () => {
    expect(gbpShared).toContain('canEditModule(\n    resolved.ctx,\n    accommodationId,\n    "website_content",\n  )');
  });
});
