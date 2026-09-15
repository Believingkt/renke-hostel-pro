import { describe, expect, it } from "vitest";
import { DEFAULT_CHILD_AGE_RULES, type ChildAgeRules } from "@/lib/child-rules";
import { evaluateIncludedCapacityPricing } from "@/lib/includedCapacityPricing";

/** 幼兒：允許、不計 physical capacity、max_count 5、免費、超出 500/晚 */
const rules = (toddlerCapacity = false, maxTotal: number | null = null): ChildAgeRules => ({
  ...DEFAULT_CHILD_AGE_RULES,
  max_total_guests: maxTotal,
  tiers: {
    ...DEFAULT_CHILD_AGE_RULES.tiers,
    toddler: {
      ...DEFAULT_CHILD_AGE_RULES.tiers.toddler,
      allowed: true,
      fee_per_night: 0,
      counts_toward_capacity: toddlerCapacity,
      max_count: 5,
      over_limit_fee_per_night: 500,
    },
  },
});

const evalCase = (adults: number, toddlers: number, included: number, r = rules()) =>
  evaluateIncludedCapacityPricing(r, { infants: 0, toddlers, children: 0 }, 1, adults, included);

describe("GENERAL BOOKING included_guest_count 14 人案例", () => {
  it("9A+4T → 0", () => expect(evalCase(9, 4, 14).extraFeeTotal).toBe(0));
  it("14A+5T → 0", () => expect(evalCase(14, 5, 14).extraFeeTotal).toBe(0));
  it("13A+8T → 1000", () => {
    const r = evalCase(13, 8, 14);
    expect(r.actualGuestCount).toBe(21);
    expect(r.capacityHeadcount).toBe(13);
    expect(r.overflow).toBe(7);
    expect(r.extraFeeTotal).toBe(1000);
  });
  it("9A+6T → 0", () => expect(evalCase(9, 6, 14).extraFeeTotal).toBe(0));
  it("9A+8T → 0", () => expect(evalCase(9, 8, 14).extraFeeTotal).toBe(0));
});

describe("physical capacity 與 included pool 已拆開", () => {
  it("included 12 / physical max 16：12A+3T 依 overflow 規則計價", () => {
    const r = evalCase(12, 3, 12);
    expect(r.actualGuestCount).toBe(15);
    expect(r.capacityHeadcount).toBe(12);
    expect(r.overflow).toBe(3);
    expect(r.extraFeeTotal).toBe(0);
  });

  it("14A+8T（幼兒不計容量，max_total 14）→ ALLOW", () => {
    expect(evalCase(14, 8, 14, rules(false, 14)).blocked).toBe(false);
  });

  it("15A+1T（max_total 14）→ REJECT", () => {
    expect(evalCase(15, 1, 14, rules(false, 14)).blocked).toBe(true);
  });

  it("9A+8T（幼兒計容量，max_total 14）→ REJECT", () => {
    expect(evalCase(9, 8, 14, rules(true, 14)).blocked).toBe(true);
  });
});
