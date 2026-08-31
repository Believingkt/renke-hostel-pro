/**
 * Pure helpers for applying Google Business Profile candidate reviews to the
 * public website.
 *
 * IMPORTANT — frontend contract:
 * The public site reads `accommodation_info.google_reviews_cache` and picks
 * entries via `google_reviews_selected_keys`, whose key generator is
 * `${authorName}__${publishTime}`. We keep that exact display-key contract and
 * additionally carry `googleReviewName` (the stable Google resource name) for
 * internal dedup. Display count is never touched here.
 */

export const MIN_APPLY_SELECTION = 4;

export interface GbpCandidate {
  review_name: string;
  reviewer_name: string | null;
  reviewer_photo_url: string | null;
  star_rating: number | null;
  comment: string | null;
  create_time: string | null;
  update_time: string | null;
}

export interface FrontendReview {
  rating: number;
  text: string;
  authorName: string;
  authorPhoto: string | null;
  authorUrl: string | null;
  publishTime: string | null;
  relativeTime: string | null;
  googleReviewName: string;
}

/** Same key generator the existing admin/front-end cache contract uses. */
export const displayReviewKey = (rv: {
  authorName: string;
  publishTime?: string | null;
}) => `${rv.authorName}__${rv.publishTime || ""}`;

export function candidateToFrontendReview(c: GbpCandidate): FrontendReview {
  return {
    rating: c.star_rating ?? 0,
    text: c.comment ?? "",
    authorName: c.reviewer_name || "Google 使用者",
    authorPhoto: c.reviewer_photo_url ?? null,
    authorUrl: null,
    publishTime: c.create_time ?? c.update_time ?? null,
    relativeTime: null,
    googleReviewName: c.review_name,
  };
}

export interface ApplyPayload {
  reviews: FrontendReview[];
  selectedKeys: string[];
}

export function buildApplyPayload(
  candidates: GbpCandidate[],
  selectedReviewNames: string[],
): ApplyPayload {
  const byName = new Map(candidates.map((c) => [c.review_name, c]));
  const reviews: FrontendReview[] = [];
  const selectedKeys: string[] = [];
  for (const name of selectedReviewNames) {
    const c = byName.get(name);
    if (!c) continue;
    const mapped = candidateToFrontendReview(c);
    reviews.push(mapped);
    const key = displayReviewKey(mapped);
    if (!selectedKeys.includes(key)) selectedKeys.push(key);
  }
  return { reviews, selectedKeys };
}

export function canApplySelection(selectedCount: number, availableCount: number) {
  if (availableCount < MIN_APPLY_SELECTION) {
    return {
      allowed: false,
      reason: "此商家目前可取得的評論不足 4 則" as const,
    };
  }
  if (selectedCount < MIN_APPLY_SELECTION) {
    return { allowed: false, reason: "請至少選擇 4 則評論" as const };
  }
  return { allowed: true, reason: null };
}

export type CandidateSort = "newest" | "rating_desc" | "rating_then_newest";

export function sortCandidates(list: GbpCandidate[], sort: CandidateSort) {
  const time = (c: GbpCandidate) =>
    c.create_time ? new Date(c.create_time).getTime() : 0;
  return [...list].sort((a, b) => {
    if (sort === "newest") return time(b) - time(a);
    if (sort === "rating_desc") return (b.star_rating ?? 0) - (a.star_rating ?? 0);
    const r = (b.star_rating ?? 0) - (a.star_rating ?? 0);
    return r !== 0 ? r : time(b) - time(a);
  });
}

export function filterCandidates(
  list: GbpCandidate[],
  opts: { keyword?: string; rating?: number | null },
) {
  const kw = (opts.keyword ?? "").trim().toLowerCase();
  return list.filter((c) => {
    if (opts.rating != null && (c.star_rating ?? 0) !== opts.rating) return false;
    if (kw) {
      const hay = `${c.comment ?? ""} ${c.reviewer_name ?? ""}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}
