import { describe, expect, it } from "vitest";
import { evaluateGroupBuyChildSelection } from "@/lib/groupBuyIncludedCapacity";
import { parseChildAgeRules } from "@lakeze/shared/lib/child-rules";
import { resolveGroupBuyPackageChildRules } from "@lakeze/shared/lib/groupBuyChildRules";

const RULES = parseChildAgeRules({
  tiers: {
    infant: { label: "嬰兒", min_age: 0, max_age: 2, fee_per_night: 0, max_count: null, allowed: true, counts_toward_capacity: false },
    toddler: { label: "幼兒", min_age: 3, max_age: 6, fee_per_night: 800, max_count: null, allowed: true, counts_toward_capacity: true },
    child: { label: "兒童", min_age: 7, max_age: 12, fee_per_night: 1000, max_count: null, allowed: true, counts_toward_capacity: true },
  },
  note: null,
  max_total_guests: null,
});

const ev = (adults: number, sel: { infants?: number; toddlers?: number; children?: number }, included: number | null, nights = 1) =>
  evaluateGroupBuyChildSelection(
    RULES,
    { infants: sel.infants ?? 0, toddlers: sel.toddlers ?? 0, children: sel.children ?? 0 },
    nights,
    adults,
    included,
  );

describe("團購方案已包含人數（Included Capacity）計價", () => {
  it("12 人方案、9 成人 + 2 幼兒 = 11 人 → 未超過已含人數，幼兒不加價", () => {
    const r = ev(9, { toddlers: 2 }, 12);
    expect(r.capacityHeadcount).toBe(11);
    expect(r.overflow).toBe(0);
    expect(r.extraFeeTotal).toBe(0);
  });

  it("剛好等於已含人數也不加價（邊界）", () => {
    expect(ev(10, { children: 2 }, 12).extraFeeTotal).toBe(0);
  });

  it("超出已含人數才計價，且只對超出的人頭收一次（不 double charge）", () => {
    const r = ev(10, { toddlers: 1, children: 2 }, 12);
    expect(r.capacityHeadcount).toBe(13);
    expect(r.overflow).toBe(1);
    // 超出 1 位，取費用最高者（兒童 1000）計價一次
    expect(r.extraFeeTotal).toBe(1000);
  });

  it("多晚以逐晚計算", () => {
    expect(ev(12, { children: 1 }, 12, 3).extraFeeTotal).toBe(3000);
  });

  it("未設定已含人數 → 維持既有行為，所有兒童照舊計價", () => {
    expect(ev(2, { toddlers: 1, children: 1 }, null).extraFeeTotal).toBe(1800);
  });

  it("不計入容量的嬰兒不佔已含人數，也不因 included 而改變其收費規則", () => {
    const r = ev(12, { infants: 2 }, 12);
    expect(r.capacityHeadcount).toBe(12);
    expect(r.extraFeeTotal).toBe(0);
  });

  it("硬限制仍優先：不接受入住的年齡層照樣擋下", () => {
    const blocked = parseChildAgeRules({
      ...(RULES as any),
      tiers: { ...RULES.tiers, child: { ...RULES.tiers.child, allowed: false } },
    });
    const r = evaluateGroupBuyChildSelection(blocked, { infants: 0, toddlers: 0, children: 1 }, 1, 2, 12);
    expect(r.blocked).toBe(true);
  });
});

describe("兒童規則 SoT 改為 PER PACKAGE", () => {
  const CAMPAIGN = { ...RULES, tier_visibility: { infant: true, toddler: true, child: true } };

  it("方案已設定 → 以方案為唯一來源", () => {
    const pkg = {
      ...RULES,
      tiers: { ...RULES.tiers, toddler: { ...RULES.tiers.toddler, fee_per_night: 300 } },
      tier_visibility: { infant: false, toddler: true, child: true },
    };
    const r = resolveGroupBuyPackageChildRules(pkg, CAMPAIGN, null, null);
    expect(r.tiers.toddler.fee_per_night).toBe(300);
    expect(r.tier_visibility.infant).toBe(false);
  });

  it("方案未設定 → 過渡期 fallback 活動層，再 fallback 民宿規則", () => {
    expect(resolveGroupBuyPackageChildRules(null, CAMPAIGN, null, null).tiers.child.fee_per_night).toBe(1000);
    expect(resolveGroupBuyPackageChildRules(null, null, RULES, null).tiers.child.fee_per_night).toBe(1000);
  });

  it("兩個方案可以各有不同規則", () => {
    const a = resolveGroupBuyPackageChildRules(
      { ...RULES, tiers: { ...RULES.tiers, child: { ...RULES.tiers.child, fee_per_night: 0 } } },
      CAMPAIGN,
      null,
    );
    const b = resolveGroupBuyPackageChildRules(null, CAMPAIGN, null);
    expect(a.tiers.child.fee_per_night).toBe(0);
    expect(b.tiers.child.fee_per_night).toBe(1000);
  });
});
