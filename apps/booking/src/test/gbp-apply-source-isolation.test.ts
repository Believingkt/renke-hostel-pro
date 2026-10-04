/**
 * Phase 2E precheck contracts: apply-to-frontend, source isolation and
 * auto-sync routing. Source-level assertions only — no network, no DB.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildApplyPayload,
  canApplySelection,
  displayReviewKey,
  type GbpCandidate,
} from "@/lib/gbpApply";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const placesFn = read("supabase/functions/fetch-google-reviews/index.ts");
const autoSyncFn = read("supabase/functions/auto-sync-google-reviews/index.ts");
const gbpFetchFn = read(
  "supabase/functions/fetch-google-business-profile-reviews/index.ts",
);
const applyUi = read(
  "apps/booking/src/components/website-content/GoogleBusinessProfileReviews.tsx",
);
const settingsUi = read(
  "apps/booking/src/components/website-content/GoogleBusinessProfileSettings.tsx",
);

describe("source isolation: Places must skip Business Profile accommodations", () => {
  it("reads review_source before any cache write", () => {
    const guard = placesFn.indexOf('review_source === "BUSINESS_PROFILE"');
    const write = placesFn.indexOf("google_reviews_cache:");
    expect(guard).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(guard);
    expect(placesFn).toContain("skipped: true");
  });

  it("keeps the legacy Places 5-review mapping untouched", () => {
    expect(placesFn).toContain("(place.reviews || []).slice(0, 5)");
    expect(placesFn).toContain("relativePublishTimeDescription");
  });
});

describe("auto-sync routing is mutually exclusive per accommodation", () => {
  it("excludes Places entirely from the scheduled path (Places batch disabled)", () => {
    expect(autoSyncFn).toContain('.eq("review_source", "BUSINESS_PROFILE")');
    expect(autoSyncFn).toContain('PLACES_SCHEDULED_SYNC = "DISABLED"');
  });

  it("routes connected Business Profile accommodations to the GBP function", () => {
    expect(autoSyncFn).toContain("fetch-google-business-profile-reviews");
    expect(autoSyncFn).toContain('g.connection_status === "CONNECTED"');
  });

  it("uses the service-role key for internal scheduled calls only", () => {
    expect(autoSyncFn).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(autoSyncFn).toContain("Authorization: `Bearer ${serviceKey}`");
  });

  it("never writes frontend cache fields from auto-sync or GBP sync", () => {
    for (const src of [autoSyncFn, gbpFetchFn]) {
      expect(src).not.toContain("google_reviews_cache:");
      expect(src).not.toContain("google_reviews_selected_keys");
      expect(src).not.toContain("google_reviews_display_count");
    }
  });
});

describe("manual sync routing", () => {
  it("Business Profile card syncs through the GBP function", () => {
    expect(settingsUi).toContain('"fetch-google-business-profile-reviews"');
    expect(settingsUi).not.toContain('"fetch-google-reviews"');
  });

  it("sync does not auto-apply", () => {
    expect(settingsUi).not.toContain("buildApplyPayload");
    expect(settingsUi).not.toContain("accommodation_info");
  });

  it("source toggle only persists review_source", () => {
    expect(settingsUi).toContain("persist({ review_source: next })");
    expect(settingsUi).not.toContain("google_reviews_cache");
  });

  it("Business Profile source option is disabled until connected", () => {
    expect(settingsUi).toContain("disabled={readOnly || !connected}");
    expect(settingsUi).toContain(
      'const connected = status === "CONNECTED" && !!selectedLocation;',
    );
  });
});

describe("apply-to-frontend write contract", () => {
  it("writes cache + selected keys but never display_count", () => {
    expect(applyUi).toContain("google_reviews_cache:");
    expect(applyUi).toContain("google_reviews_selected_keys:");
    expect(applyUi).not.toContain("google_reviews_display_count:");
  });

  it("verifies affected rows and fails closed on 0 rows", () => {
    expect(applyUi).toContain('.select("id")');
    expect(applyUi).toContain("if (!data || data.length === 0)");
    const zero = applyUi.indexOf("if (!data || data.length === 0)");
    const success = applyUi.indexOf("toast.success");
    expect(success).toBeGreaterThan(zero);
  });

  it("gates the apply button on permission and the minimum rule", () => {
    expect(applyUi).toContain("disabled={readOnly || applying || !applyState.allowed}");
    expect(applyUi).toContain('canEdit("website_content")');
  });
});

const candidate = (i: number): GbpCandidate => ({
  review_name: `accounts/1/locations/9/reviews/r${i}`,
  reviewer_name: `User ${i}`,
  reviewer_photo_url: `http://p/${i}`,
  star_rating: 5,
  comment: `stay ${i}`,
  create_time: `2026-08-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
  update_time: null,
});

const pool = Array.from({ length: 8 }, (_, i) => candidate(i));

describe("minimum 4 rule", () => {
  it.each([
    [0, false],
    [1, false],
    [3, false],
    [4, true],
    [5, true],
    [8, true],
  ])("selected %i → allowed %s", (n, allowed) => {
    expect(canApplySelection(n, pool.length).allowed).toBe(allowed);
  });

  it("explains a pool that is itself smaller than 4 instead of faking reviews", () => {
    expect(canApplySelection(2, 3).reason).toBe("此商家目前可取得的評論不足 4 則");
  });
});

describe("existing frontend cache compatibility", () => {
  const selection = pool.slice(0, 4).map((c) => c.review_name);
  const payload = buildApplyPayload(pool, selection);

  it("maps every legacy display field", () => {
    for (const rv of payload.reviews) {
      expect(rv).toHaveProperty("authorName");
      expect(rv).toHaveProperty("authorPhoto");
      expect(rv).toHaveProperty("rating");
      expect(rv).toHaveProperty("text");
      expect(rv).toHaveProperty("publishTime");
      expect(rv).toHaveProperty("relativeTime");
      expect(rv).toHaveProperty("authorUrl");
    }
  });

  it("keeps the legacy authorName__publishTime selected-key generator", () => {
    expect(payload.selectedKeys).toEqual(
      payload.reviews.map((r) => `${r.authorName}__${r.publishTime}`),
    );
    expect(payload.selectedKeys[0]).toBe(displayReviewKey(payload.reviews[0]));
  });

  it("carries review_name internally without breaking legacy readers", () => {
    expect(payload.reviews[0].googleReviewName).toBe(pool[0].review_name);
  });

  it("preserves the admin selection order", () => {
    const shuffled = [pool[5], pool[1], pool[7], pool[0]].map((c) => c.review_name);
    const out = buildApplyPayload(pool, shuffled);
    expect(out.reviews.map((r) => r.googleReviewName)).toEqual(shuffled);
  });
});
