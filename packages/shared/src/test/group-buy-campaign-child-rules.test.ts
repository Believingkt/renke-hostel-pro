import { describe, expect, it } from "vitest";
import {
  anyGroupBuyTierVisible,
  initGroupBuyChildRulesFrom,
  parseGroupBuyChildRules,
  resolveGroupBuyChildRules,
} from "@lakeze/shared/lib/groupBuyChildRules";
import { evaluateChildSelection, parseChildAgeRules } from "@lakeze/shared/lib/child-rules";
import { applyVisibilityToGuests } from "@lakeze/shared/lib/groupBuyChildVisibility";

const GENERAL = {
  tiers: {
    infant: { label: "嬰兒", min_age: 0, max_age: 2, fee_per_night: 0, max_count: 2, allowed: true, counts_toward_capacity: false },
    toddler: { label: "幼兒", min_age: 3, max_age: 6, fee_per_night: 0, max_count: 1, over_limit_fee_per_night: 500, allowed: true, counts_toward_capacity: false },
    child: { label: "兒童", min_age: 7, max_age: 12, fee_per_night: 0, max_count: 1, allowed: false, counts_toward_capacity: true },
  },
  note: "一般訂房備註",
  max_total_guests: null,
};

describe("團購活動層兒童分齡規則（Campaign-Level）", () => {
  it("campaign 未設定時 fallback 既有行為（民宿規則、三種全顯示）", () => {
    const r = resolveGroupBuyChildRules(null, GENERAL, null);
    expect(r.tiers.toddler.max_age).toBe(6);
    expect(r.tier_visibility).toEqual({ infant: true, toddler: true, child: true });
  });

  it("campaign 設定後成為唯一 SoT，不再受民宿規則影響", () => {
    const campaign = {
      ...GENERAL,
      tiers: {
        ...GENERAL.tiers,
        toddler: { ...GENERAL.tiers.toddler, max_age: 7, fee_per_night: 500 },
      },
      tier_visibility: { infant: true, toddler: true, child: false },
    };
    const r = resolveGroupBuyChildRules(campaign, GENERAL, null);
    expect(r.tiers.toddler.max_age).toBe(7);
    expect(r.tiers.toddler.fee_per_night).toBe(500);
    // 一般訂房來源完全不變
    expect(parseChildAgeRules(GENERAL).tiers.toddler.max_age).toBe(6);
    expect(parseChildAgeRules(GENERAL).tiers.toddler.fee_per_night).toBe(0);
  });

  it("所有方案共用同一套規則（不再讀 package 層）", () => {
    const campaign = { ...GENERAL, tier_visibility: { infant: true, toddler: true, child: false } };
    const a = resolveGroupBuyChildRules(campaign, GENERAL, { tiers: { toddler: { max_age: 99 } } });
    const b = resolveGroupBuyChildRules(campaign, GENERAL, null);
    expect(a).toEqual(b);
  });

  it("顯示 OFF 不刪除設定，重新開啟完整恢復", () => {
    const off = parseGroupBuyChildRules({
      ...GENERAL,
      tiers: { ...GENERAL.tiers, child: { ...GENERAL.tiers.child, fee_per_night: 500, max_count: 1, allowed: true } },
      tier_visibility: { infant: true, toddler: true, child: false },
    });
    expect(off.tiers.child.fee_per_night).toBe(500);
    const on = { ...off, tier_visibility: { ...off.tier_visibility, child: true } };
    expect(on.tiers.child).toEqual(off.tiers.child);
  });

  it("三種全 OFF 只剩成人；隱藏 tier 人數 clamp 為 0", () => {
    const rules = parseGroupBuyChildRules({
      ...GENERAL,
      tier_visibility: { infant: false, toddler: false, child: false },
    });
    expect(anyGroupBuyTierVisible(rules)).toBe(false);
    const g = applyVisibilityToGuests({ adults: 2, children: 3, toddlers: 2, infants: 1 }, rules.tier_visibility);
    expect(g).toEqual({ adults: 2, children: 0, toddlers: 0, infants: 0 });
  });

  it("計價共用一般 calculator，但吃團購自己的設定", () => {
    const campaign = {
      ...GENERAL,
      tiers: { ...GENERAL.tiers, toddler: { ...GENERAL.tiers.toddler, fee_per_night: 500, max_count: 2 } },
      tier_visibility: { infant: true, toddler: true, child: true },
    };
    const gb = resolveGroupBuyChildRules(campaign, GENERAL, null);
    expect(evaluateChildSelection(gb, { infants: 0, toddlers: 2, children: 0 }, 1, 2).extraFeeTotal).toBe(1000);
    expect(
      evaluateChildSelection(parseChildAgeRules(GENERAL), { infants: 0, toddlers: 1, children: 0 }, 1, 2).extraFeeTotal,
    ).toBe(0);
  });

  it("COPY ONCE 初始化來自民宿規則，之後為獨立 snapshot", () => {
    const init = initGroupBuyChildRulesFrom(GENERAL);
    expect(init.tiers.child.max_age).toBe(12);
    init.tiers.child.max_age = 14;
    expect(parseChildAgeRules(GENERAL).tiers.child.max_age).toBe(12);
  });
});
