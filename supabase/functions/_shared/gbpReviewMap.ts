// Pure helpers for Google Business Profile review syncing.
// No Deno / network imports so they can be unit tested directly.

export interface GbpApiReview {
  name?: string;
  reviewId?: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string };
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
}

export const STAR_RATING_MAP: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

export function starRatingToNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    if (STAR_RATING_MAP[v] != null) return STAR_RATING_MAP[v];
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** How many reviews a sync target wants. `ALL` = unbounded (page cap applies). */
export function targetLimit(syncTarget: string): number | null {
  if (syncTarget === "20") return 20;
  if (syncTarget === "50") return 50;
  return null; // ALL
}

export const MAX_PAGES = 20;
export const PAGE_SIZE = 50;

/** Should we keep paging? */
export function shouldFetchMore(
  collected: number,
  syncTarget: string,
  hasNextPage: boolean,
  pagesFetched: number,
): boolean {
  if (!hasNextPage) return false;
  if (pagesFetched >= MAX_PAGES) return false;
  const limit = targetLimit(syncTarget);
  if (limit != null && collected >= limit) return false;
  return true;
}

export interface CandidateRow {
  accommodation_id: string;
  review_name: string;
  review_id: string | null;
  account_name: string;
  location_name: string;
  reviewer_name: string | null;
  reviewer_photo_url: string | null;
  star_rating: number | null;
  comment: string | null;
  create_time: string | null;
  update_time: string | null;
  synced_at: string;
  raw_metadata: Record<string, unknown> | null;
}

export function mapReviewToRow(
  rv: GbpApiReview,
  ctx: {
    accommodationId: string;
    accountName: string;
    locationName: string;
    syncedAt: string;
  },
): CandidateRow | null {
  if (!rv.name) return null;
  return {
    accommodation_id: ctx.accommodationId,
    review_name: rv.name,
    review_id: rv.reviewId ?? null,
    account_name: ctx.accountName,
    location_name: ctx.locationName,
    reviewer_name: rv.reviewer?.displayName ?? null,
    reviewer_photo_url: rv.reviewer?.profilePhotoUrl ?? null,
    star_rating: starRatingToNumber(rv.starRating),
    comment: rv.comment ?? null,
    create_time: rv.createTime ?? null,
    update_time: rv.updateTime ?? null,
    synced_at: ctx.syncedAt,
    raw_metadata: { starRating: rv.starRating ?? null },
  };
}

/** Dedup on the stable Google resource name, last occurrence wins. */
export function dedupRows(rows: CandidateRow[]): CandidateRow[] {
  const map = new Map<string, CandidateRow>();
  for (const r of rows) map.set(r.review_name, r);
  return [...map.values()];
}
