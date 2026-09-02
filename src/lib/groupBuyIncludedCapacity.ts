/**
 * 團購專用 wrapper：改為委派共用的
 * SHARED PACKAGE-INCLUDED CHILD PRICING CONTRACT（src/lib/includedCapacityPricing.ts）。
 *
 * 團購與一般 /booking 共用同一套計算 contract；設定 storage 仍各自獨立。
 */
import type { ChildAgeRules, ChildSelection } from "@/lib/child-rules";
import {
  type IncludedCapacityEvaluation,
  evaluateIncludedCapacityPricing,
  resolveIncludedGuestCount,
} from "@/lib/includedCapacityPricing";

export type GroupBuyChildEvaluation = IncludedCapacityEvaluation;

/** 方案已包含人數：included_guest_count 優先，其次 max_guests；皆無 = null */
export function packageIncludedGuestCount(pkg: {
  included_guest_count?: number | null;
  max_guests?: number | null;
} | null | undefined): number | null {
  if (!pkg) return null;
  return resolveIncludedGuestCount(pkg.included_guest_count, pkg.max_guests);
}

export function evaluateGroupBuyChildSelection(
  rules: ChildAgeRules,
  selection: ChildSelection,
  nights: number,
  adults: number,
  includedGuestCount: number | null,
): GroupBuyChildEvaluation {
  return evaluateIncludedCapacityPricing(rules, selection, nights, adults, includedGuestCount);
}
