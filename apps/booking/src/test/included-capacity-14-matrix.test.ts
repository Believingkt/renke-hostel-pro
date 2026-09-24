import { describe, expect, it } from "vitest";
import { DEFAULT_CHILD_AGE_RULES, type ChildAgeRules } from "@lakeze/shared/lib/child-rules";
import { evaluateIncludedCapacityPricing } from "@/lib/includedCapacityPricing";

/** 幼兒：allowed, 不計容量, max_count=5, fee=0, over_limit_fee=500 */
const rules = (opts?: { toddlerCapacity?: boolean; maxTotal?: number | null; toddlerFee?: number }): ChildAgeRules => ({
  ...DEFAULT_CHILD_AGE_RULES,
  max_total_guests: opts?.maxTotal === undefined ? 14 : opts.maxTotal,
  tiers: {
    infant: { ...DEFAULT_CHILD_AGE_RULES.tiers.infant, allowed: true, fee_per_night: 0, counts_toward_capacity: false, max_count: null, over_limit_fee_per_night: 0 },
    toddler: {
      ...DEFAULT_CHILD_AGE_RULES.tiers.toddler,
      allowed: true,
      fee_per_night: opts?.toddlerFee ?? 0,
      counts_toward_capacity: opts?.toddlerCapacity ?? false,
      max_count: 5,
      over_limit_fee_per_night: 500,
    },
    child: { ...DEFAULT_CHILD_AGE_RULES.tiers.child, allowed: true, fee_per_night: 800, counts_toward_capacity: true, max_count: null, over_limit_fee_per_night: 0 },
  },
});

const run = (adults: number, toddlers: number, r = rules(), included: number | null = 14) =>
  evaluateIncludedCapacityPricing(r, { infants: 0, toddlers, children: 0 }, 1, adults, included);

describe("14 人 included pool 矩陣（Group Buy 與 General 共用同一 contract）", () => {
  it("9A+4T = NT$0", () => {
    const r = run(9, 4);
    expect([r.actualGuestCount, r.capacityHeadcount, r.overflow, r.extraFeeTotal]).toEqual([13, 9, 0, 0]);
  });
  it("14A+5T = NT$0", () => {
    const r = run(14, 5);
    expect([r.actualGuestCount, r.capacityHeadcount, r.overflow, r.extraFeeTotal]).toEqual([19, 14, 5, 0]);
  });
  it("13A+8T = NT$1000", () => {
    const r = run(13, 8);
    expect([r.actualGuestCount, r.capacityHeadcount, r.overflow, r.extraFeeTotal]).toEqual([21, 13, 7, 1000]);
  });
  it("9A+6T = NT$0", () => {
    expect(run(9, 6).extraFeeTotal).toBe(0);
  });
  it("9A+8T = NT$0（max_count 只作用於 overflow）", () => {
    const r = run(9, 8);
    expect([r.overflow, r.extraFeeTotal]).toEqual([3, 0]);
  });

  it("counts_toward_capacity=false 仍計入 actual 並吃 included pool", () => {
    const r = run(9, 4);
    expect(r.actualGuestCount).toBe(13);
    expect(r.overflow).toBe(0);
  });

  it("fee_per_night 在 included pool 內不收費（9A+5T, fee=300）", () => {
    expect(run(9, 5, rules({ toddlerFee: 300 })).extraFeeTotal).toBe(0);
  });

  it("14A+8T（幼兒不計容量）不得因 physical capacity 拒絕", () => {
    const r = run(14, 8);
    expect(r.blocked).toBe(false);
  });
  it("15A+1T max14 → REJECT", () => {
    const r = evaluateIncludedCapacityPricing(rules(), { infants: 0, toddlers: 1, children: 0 }, 1, 15, 14);
    expect(r.blocked).toBe(true);
  });
  it("9A+8T（幼兒計容量）capacity 17 > 14 → REJECT", () => {
    const r = run(9, 8, rules({ toddlerCapacity: true }));
    expect(r.blocked).toBe(true);
  });

  it("allowed=false 仍以 raw count 阻擋", () => {
    const r0 = rules();
    const blockedRules: ChildAgeRules = {
      ...r0,
      tiers: { ...r0.tiers, toddler: { ...r0.tiers.toddler, allowed: false } },
    };
    expect(run(2, 1, blockedRules).blocked).toBe(true);
  });

  it("混合 tier 分配 deterministic（費用低者優先吃 included pool）", () => {
    const r = evaluateIncludedCapacityPricing(rules(), { infants: 1, toddlers: 2, children: 3 }, 1, 9, 12);
    // included 12 - 9 成人 = 3 → 嬰兒(0)、幼兒(0)×2 先吃滿，兒童 3 位 overflow × 800
    expect(r.extraFeeTotal).toBe(2400);
    const again = evaluateIncludedCapacityPricing(rules(), { children: 3, toddlers: 2, infants: 1 } as never, 1, 9, 12);
    expect(again.extraFeeTotal).toBe(r.extraFeeTotal);
  });
});
