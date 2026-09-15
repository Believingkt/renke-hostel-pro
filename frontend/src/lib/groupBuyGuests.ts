/**
 * 團購訂房專用的人數組成 helper（僅團購使用，不影響一般訂房頁）。
 * 規則一律沿用既有 src/lib/child-rules.ts，不在此重寫任何兒童規則。
 */
import type { ChildAgeRules, ChildSelection } from "@/lib/child-rules";

export interface GuestCounts {
  adults: number;
  children: number;
  toddlers: number;
  infants: number;
}

export const DEFAULT_GUEST_COUNTS: GuestCounts = { adults: 2, children: 0, toddlers: 0, infants: 0 };

export function toChildSelection(g: GuestCounts): ChildSelection {
  return { infants: g.infants, toddlers: g.toddlers, children: g.children };
}

/** 團購 orders.guest_count 定義：成人＋兒童＋幼兒（不含嬰兒） */
export function billableGuestCount(g: GuestCounts): number {
  return g.adults + g.children + g.toddlers;
}

/** 「2 成人・1 兒童・1 幼兒・1 嬰兒」，0 位者不顯示 */
export function formatGuestComposition(g: GuestCounts, rules?: ChildAgeRules | null): string {
  const label = (k: "child" | "toddler" | "infant", fallback: string) =>
    rules?.tiers?.[k]?.label || fallback;
  const parts: string[] = [];
  if (g.adults > 0) parts.push(`${g.adults} 成人`);
  if (g.children > 0) parts.push(`${g.children} ${label("child", "兒童")}`);
  if (g.toddlers > 0) parts.push(`${g.toddlers} ${label("toddler", "幼兒")}`);
  if (g.infants > 0) parts.push(`${g.infants} ${label("infant", "嬰兒")}`);
  return parts.join("・");
}
