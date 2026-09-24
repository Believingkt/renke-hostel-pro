import { describe, expect, it } from "vitest";
import {
  dedupRows,
  mapReviewToRow,
  MAX_PAGES,
  PAGE_SIZE,
  shouldFetchMore,
  trimToTarget,
  targetLimit,
  type CandidateRow,
} from "../../../../supabase/functions/_shared/gbpReviewMap";

const ctx = (accommodationId = "acc-1") => ({
  accommodationId,
  accountName: "accounts/1",
  locationName: "locations/9",
  syncedAt: "2026-08-31T00:00:00.000Z",
});

const apiReview = (i: number, extra: Record<string, unknown> = {}) => ({
  name: `accounts/1/locations/9/reviews/r${i}`,
  reviewId: `r${i}`,
  reviewer: { displayName: `User ${i}`, profilePhotoUrl: `http://p/${i}` },
  starRating: "FIVE",
  comment: `comment ${i}`,
  createTime: "2026-08-01T00:00:00Z",
  updateTime: "2026-08-01T00:00:00Z",
  ...extra,
});

/** Simulates the edge function paging + persist decision, without network. */
function simulateSync(pages: Array<{ count: number; offset: number }>, syncTarget: string) {
  const rows: CandidateRow[] = [];
  let fetched = 0;
  let hasNext = true;
  for (const page of pages) {
    for (let i = 0; i < page.count; i++) {
      const row = mapReviewToRow(apiReview(page.offset + i), ctx());
      if (row) rows.push(row);
    }
    fetched += 1;
    hasNext = fetched < pages.length;
    if (!shouldFetchMore(rows.length, syncTarget, hasNext, fetched)) break;
  }
  const partial = fetched >= MAX_PAGES && hasNext;
  return { written: trimToTarget(dedupRows(rows), syncTarget), pages: fetched, partial };
}

describe("sync targets (persisted candidate counts)", () => {
  it("CASE 1: Google returns 5, target 20 → 5 rows", () => {
    expect(simulateSync([{ count: 5, offset: 0 }], "20").written).toHaveLength(5);
  });

  it("CASE 2: first page 50, target 20 → exactly 20 rows", () => {
    expect(simulateSync([{ count: 50, offset: 0 }], "20").written).toHaveLength(20);
  });

  it("CASE 3: first page 50, target 50 → exactly 50 rows", () => {
    expect(simulateSync([{ count: 50, offset: 0 }], "50").written).toHaveLength(50);
  });

  it("CASE 4: two pages 50 + 30, target ALL → 80 rows", () => {
    const out = simulateSync([{ count: 50, offset: 0 }, { count: 30, offset: 50 }], "ALL");
    expect(out.written).toHaveLength(80);
    expect(out.pages).toBe(2);
  });

  it("CASE 5: many pages, target 50 → stops at 50, writes no more", () => {
    const out = simulateSync(
      Array.from({ length: 6 }, (_, p) => ({ count: 50, offset: p * 50 })),
      "50",
    );
    expect(out.written).toHaveLength(50);
    expect(out.pages).toBe(1);
  });

  it("CASE 6: ALL hits MAX_PAGES with nextPageToken → PARTIAL", () => {
    const out = simulateSync(
      Array.from({ length: MAX_PAGES + 3 }, (_, p) => ({ count: PAGE_SIZE, offset: p * PAGE_SIZE })),
      "ALL",
    );
    expect(out.pages).toBe(MAX_PAGES);
    expect(out.partial).toBe(true);
    expect(out.written.length).toBe(MAX_PAGES * PAGE_SIZE);
  });

  it("ALL is unbounded by target", () => {
    expect(targetLimit("ALL")).toBeNull();
    expect(trimToTarget(simulateSync([{ count: 120, offset: 0 }], "ALL").written, "ALL")).toHaveLength(120);
  });
});

describe("dedup stability", () => {
  it("syncing the same review twice yields one row", () => {
    const a = mapReviewToRow(apiReview(1), ctx())!;
    const b = mapReviewToRow(apiReview(1), ctx())!;
    expect(dedupRows([a, b])).toHaveLength(1);
  });

  it("updated content replaces the existing candidate instead of duplicating", () => {
    const a = mapReviewToRow(apiReview(1), ctx())!;
    const b = mapReviewToRow(
      apiReview(1, { comment: "edited", starRating: "TWO", updateTime: "2026-09-01T00:00:00Z" }),
      ctx(),
    )!;
    const out = dedupRows([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].comment).toBe("edited");
    expect(out[0].star_rating).toBe(2);
    expect(out[0].update_time).toBe("2026-09-01T00:00:00Z");
  });

  it("same author + same publish time but different review_name stays two rows", () => {
    const shared = {
      reviewer: { displayName: "Same Person" },
      createTime: "2026-08-01T00:00:00Z",
      updateTime: "2026-08-01T00:00:00Z",
    };
    const a = mapReviewToRow({ ...apiReview(1), ...shared }, ctx())!;
    const b = mapReviewToRow({ ...apiReview(2), ...shared }, ctx())!;
    const out = dedupRows([a, b]);
    expect(out).toHaveLength(2);
    expect(new Set(out.map((r) => r.review_name)).size).toBe(2);
  });

  it("cross-accommodation: same review_name is scoped per accommodation", () => {
    const a = mapReviewToRow(apiReview(1), ctx("acc-1"))!;
    const b = mapReviewToRow(apiReview(1), ctx("acc-2"))!;
    const scopedKey = (r: CandidateRow) => `${r.accommodation_id}|${r.review_name}`;
    expect(new Set([a, b].map(scopedKey)).size).toBe(2);
    expect(a.accommodation_id).not.toBe(b.accommodation_id);
  });
});

describe("mapping safety", () => {
  it("maps unknown star enums to null without dropping the batch", () => {
    const rows = [
      mapReviewToRow(apiReview(1, { starRating: "WEIRD_ENUM" }), ctx()),
      mapReviewToRow(apiReview(2, { starRating: "FOUR" }), ctx()),
    ].filter(Boolean) as CandidateRow[];
    expect(rows).toHaveLength(2);
    expect(rows[0].star_rating).toBeNull();
    expect(rows[1].star_rating).toBe(4);
  });

  it("raw_metadata never carries tokens or secrets", () => {
    const row = mapReviewToRow(
      apiReview(1, { accessToken: "should-not-be-copied", authorization: "Bearer x" }),
      ctx(),
    )!;
    const blob = JSON.stringify(row.raw_metadata);
    expect(blob).not.toMatch(/should-not-be-copied|Bearer|refresh_token|client_secret/i);
    expect(Object.keys(row.raw_metadata!)).toEqual(["starRating"]);
  });
});
