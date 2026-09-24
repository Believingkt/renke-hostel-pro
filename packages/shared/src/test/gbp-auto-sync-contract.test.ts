import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const autoSyncPath = path.resolve(
  process.cwd(),
  "supabase/functions/auto-sync-google-reviews/index.ts"
);
const src = fs.readFileSync(autoSyncPath, "utf8");

describe("auto-sync-google-reviews stale contract fix", () => {
  it("has zero stale column references", () => {
    expect(src).not.toMatch(/google_reviews_auto_sync_enabled/);
    expect(src).not.toMatch(/google_reviews_auto_sync_interval_hours/);
  });

  it("Places scheduled batch is DISABLED (no accommodation_info batch query)", () => {
    expect(src).not.toMatch(/from\("accommodation_info"\)/);
    expect(src).toMatch(/PLACES_SCHEDULED_SYNC\s*=\s*"DISABLED"/);
  });

  it("never falls back to Places scheduled sync", () => {
    expect(src).not.toMatch(/fetch-google-reviews"/);
  });

  it("does not mutate frontend cache fields", () => {
    expect(src).not.toMatch(/google_reviews_cache/);
    expect(src).not.toMatch(/google_reviews_selected_keys/);
    expect(src).not.toMatch(/google_reviews_display_count/);
  });

  it("requires a trusted service-role caller", () => {
    expect(src).toMatch(/token !== serviceKey/);
    expect(src).toMatch(/unauthorized/);
  });

  it("does not create or modify cron", () => {
    expect(src).not.toMatch(/cron/i);
  });
});

describe("GBP scheduled routing selection", () => {
  const select = (
    rows: Array<{
      accommodation_id: string;
      review_source: string | null;
      connection_status: string | null;
    }> | null
  ) =>
    (rows || [])
      .filter(
        (g) =>
          g.review_source === "BUSINESS_PROFILE" &&
          g.connection_status === "CONNECTED"
      )
      .map((g) => g.accommodation_id);

  it("CONNECTED → routed", () => {
    expect(
      select([
        {
          accommodation_id: "a",
          review_source: "BUSINESS_PROFILE",
          connection_status: "CONNECTED",
        },
      ])
    ).toEqual(["a"]);
  });

  it("NOT_CONFIGURED → SKIP", () => {
    expect(
      select([
        {
          accommodation_id: "a",
          review_source: "BUSINESS_PROFILE",
          connection_status: "NOT_CONFIGURED",
        },
      ])
    ).toEqual([]);
  });

  it("TOKEN_EXPIRED → SKIP", () => {
    expect(
      select([
        {
          accommodation_id: "a",
          review_source: "BUSINESS_PROFILE",
          connection_status: "TOKEN_EXPIRED",
        },
      ])
    ).toEqual([]);
  });

  it("PLACES source → never routed here", () => {
    expect(
      select([
        {
          accommodation_id: "a",
          review_source: "PLACES",
          connection_status: "CONNECTED",
        },
      ])
    ).toEqual([]);
  });
});

describe("Places manual sync unchanged", () => {
  it("fetch-google-reviews source untouched by this remediation", () => {
    const p = path.resolve(
      process.cwd(),
      "supabase/functions/fetch-google-reviews/index.ts"
    );
    const s = fs.readFileSync(p, "utf8");
    expect(s).not.toMatch(/google_reviews_auto_sync_enabled/);
    expect(s).toMatch(/google_place_id/);
  });
});
