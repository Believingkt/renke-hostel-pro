import { describe, expect, it } from "vitest";
import { DEFAULT_CHILD_AGE_RULES, type ChildAgeRules } from "@/lib/child-rules";
import {
  evaluateIncludedCapacityPricing,
  resolveIncludedGuestCount,
} from "@/lib/includedCapacityPricing";

const rules: ChildAgeRules = {
  ...DEFAULT_CHILD_AGE_RULES,
  max_total_guests: 12,
  tiers: {
    infant: { ...DEFAULT_CHILD_AGE_RULES.tiers.infant, allowed: true, fee_per_night: 0, counts_toward_capacity: false, max_count: null, over_limit_fee_per_night: 0 },
    toddler: { ...DEFAULT_CHILD_AGE_RULES.tiers.toddler, allowed: true, fee_per_night: 500, counts_toward_capacity: true, max_count: null, over_limit_fee_per_night: 0 },
    child: { ...DEFAULT_CHILD_AGE_RULES.tiers.child, allowed: true, fee_per_night: 800, counts_toward_capacity: true, max_count: null, over_limit_fee_per_night: 0 },
  },
};

describe("共用 included capacity 計價 contract", () => {
  it("9 成人 + 2 幼兒，方案含 12 人 → 0 加價", () => {
    const r = evaluateIncludedCapacityPricing(rules, { infants: 0, toddlers: 2, children: 0 }, 1, 9, 12);
    expect(r.blocked).toBe(false);
    expect(r.actualGuestCount).toBe(11);
    expect(r.overflow).toBe(0);
    expect(r.extraFeeTotal).toBe(0);
  });

  it("超出方案含人數才收費，且不重複收 package extra fee", () => {
    const r = evaluateIncludedCapacityPricing(rules, { infants: 0, toddlers: 1, children: 2 }, 2, 9, 11);
    // included 11 - 9 成人 = 2 名額，先吃便宜的幼兒(500)再吃一位兒童(800)，剩 1 位兒童收費
    expect(r.overflow).toBe(1);
    expect(r.extraFeePerNight).toBe(800);
    expect(r.extraFeeTotal).toBe(1600);
  });

  it("嬰兒不計入容量，但屬於 actual guest count", () => {
    const r = evaluateIncludedCapacityPricing(rules, { infants: 1, toddlers: 0, children: 0 }, 1, 2, 2);
    expect(r.capacityHeadcount).toBe(2);
    expect(r.actualGuestCount).toBe(3);
    expect(r.extraFeeTotal).toBe(0);
  });

  it("max_total_guests 仍以 adults + 計入容量兒童判定", () => {
    const r = evaluateIncludedCapacityPricing(rules, { infants: 0, toddlers: 3, children: 0 }, 1, 10, 20);
    expect(r.blocked).toBe(true);
  });

  it("未設定方案含人數 → included = null，維持既有逐人收費", () => {
    const r = evaluateIncludedCapacityPricing(rules, { infants: 0, toddlers: 1, children: 0 }, 1, 2, null);
    expect(r.extraFeeTotal).toBe(500);
  });

  it("resolveIncludedGuestCount 取第一個正數", () => {
    expect(resolveIncludedGuestCount(null, 0, 8)).toBe(8);
    expect(resolveIncludedGuestCount(null, undefined)).toBeNull();
  });
});
