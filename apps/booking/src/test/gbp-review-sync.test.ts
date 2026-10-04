import { describe, expect, it } from "vitest";
import {
  dedupRows,
  mapReviewToRow,
  MAX_PAGES,
  shouldFetchMore,
  starRatingToNumber,
  targetLimit,
  type CandidateRow,
} from "../../../../supabase/functions/_shared/gbpReviewMap";
import {
  buildApplyPayload,
  canApplySelection,
  displayReviewKey,
  filterCandidates,
  sortCandidates,
  type GbpCandidate,
} from "@/lib/gbpApply";

const ctx = {
  accommodationId: "acc-1",
  accountName: "accounts/1",
  locationName: "locations/9",
  syncedAt: "2026-08-31T00:00:00.000Z",
};

const apiReview = (i: number, star = "FIVE") => ({
  name: `accounts/1/locations/9/reviews/r${i}`,
  reviewId: `r${i}`,
  reviewer: { displayName: `User ${i}`, profilePhotoUrl: `http://p/${i}` },
  starRating: star,
  comment: `comment ${i}`,
  createTime: `2026-08-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
  updateTime: `2026-08-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
});

describe("star rating mapping", () => {
  it("maps Google enums to numbers", () => {
    expect(starRatingToNumber("FIVE")).toBe(5);
    expect(starRatingToNumber("ONE")).toBe(1);
    expect(starRatingToNumber("THREE")).toBe(3);
    expect(starRatingToNumber("STAR_RATING_UNSPECIFIED")).toBeNull();
  });
});

describe("sync targets and pagination", () => {
  it("resolves target limits", () => {
    expect(targetLimit("20")).toBe(20);
    expect(targetLimit("50")).toBe(50);
    expect(targetLimit("ALL")).toBeNull();
  });

  it("stops when there is no next page (5 reviews)", () => {
    expect(shouldFetchMore(5, "20", false, 1)).toBe(false);
  });

  it("stops for target 20 once 20 collected", () => {
    expect(shouldFetchMore(20, "20", true, 1)).toBe(false);
  });

  it("keeps paging for target 50 when under target", () => {
    expect(shouldFetchMore(50, "50", true, 1)).toBe(false);
    expect(shouldFetchMore(30, "50", true, 1)).toBe(true);
  });

  it("pages until nextPageToken runs out for ALL, capped by MAX_PAGES", () => {
    expect(shouldFetchMore(120, "ALL", true, 3)).toBe(true);
    expect(shouldFetchMore(120, "ALL", true, MAX_PAGES)).toBe(false);
  });
});

describe("mapping and dedup", () => {
  it("maps 50 reviews and keeps every star rating", () => {
    const stars = ["ONE", "TWO", "THREE", "FOUR", "FIVE"];
    const rows = Array.from({ length: 50 }, (_, i) =>
      mapReviewToRow(apiReview(i, stars[i % 5]), ctx),
    ).filter(Boolean) as CandidateRow[];
    expect(rows).toHaveLength(50);
    expect(rows.some((r) => r.star_rating === 1)).toBe(true);
    expect(rows.some((r) => r.star_rating === 3)).toBe(true);
  });

  it("drops reviews without a resource name", () => {
    expect(mapReviewToRow({ comment: "x" }, ctx)).toBeNull();
  });

  it("dedups on resource name, updating existing entries", () => {
    const a = mapReviewToRow(apiReview(1), ctx)!;
    const b = mapReviewToRow({ ...apiReview(1), comment: "updated" }, ctx)!;
    const out = dedupRows([a, b, mapReviewToRow(apiReview(2), ctx)!]);
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.review_id === "r1")!.comment).toBe("updated");
  });

  it("produces no duplicates across simulated pages", () => {
    const page1 = Array.from({ length: 50 }, (_, i) => mapReviewToRow(apiReview(i), ctx)!);
    const page2 = Array.from({ length: 50 }, (_, i) => mapReviewToRow(apiReview(i + 40), ctx)!);
    const out = dedupRows([...page1, ...page2]);
    expect(out).toHaveLength(90);
    expect(new Set(out.map((r) => r.review_name)).size).toBe(90);
  });
});

const candidate = (i: number, star: number, day = 1): GbpCandidate => ({
  review_name: `accounts/1/locations/9/reviews/r${i}`,
  reviewer_name: `User ${i}`,
  reviewer_photo_url: null,
  star_rating: star,
  comment: `great stay ${i}`,
  create_time: `2026-08-${String(day).padStart(2, "0")}T00:00:00Z`,
  update_time: null,
});

describe("apply to frontend", () => {
  const pool = [
    candidate(1, 5, 5),
    candidate(2, 4, 4),
    candidate(3, 5, 3),
    candidate(4, 3, 2),
    candidate(5, 5, 1),
  ];

  it("denies apply below 4 selections", () => {
    expect(canApplySelection(0, pool.length).allowed).toBe(false);
    expect(canApplySelection(3, pool.length).allowed).toBe(false);
    expect(canApplySelection(3, pool.length).reason).toBe("請至少選擇 4 則評論");
  });

  it("allows apply at 4 and above", () => {
    expect(canApplySelection(4, pool.length).allowed).toBe(true);
    expect(canApplySelection(5, pool.length).allowed).toBe(true);
  });

  it("explains when the business itself has fewer than 4 reviews", () => {
    expect(canApplySelection(2, 2).reason).toBe("此商家目前可取得的評論不足 4 則");
  });

  it("maps candidates to the existing frontend cache contract", () => {
    const { reviews, selectedKeys } = buildApplyPayload(
      pool,
      pool.slice(0, 4).map((c) => c.review_name),
    );
    expect(reviews).toHaveLength(4);
    const first = reviews[0];
    expect(first).toMatchObject({
      rating: 5,
      authorName: "User 1",
      text: "great stay 1",
      publishTime: "2026-08-05T00:00:00Z",
    });
    expect(first.googleReviewName).toBe(pool[0].review_name);
    expect(selectedKeys[0]).toBe(displayReviewKey(first));
    expect(selectedKeys[0]).toBe("User 1__2026-08-05T00:00:00Z");
  });

  it("filters and sorts candidates", () => {
    expect(filterCandidates(pool, { rating: 5 })).toHaveLength(3);
    expect(filterCandidates(pool, { keyword: "stay 4" })).toHaveLength(1);
    expect(sortCandidates(pool, "newest")[0].review_name).toContain("r1");
    expect(sortCandidates(pool, "rating_then_newest")[0].star_rating).toBe(5);
  });
});
