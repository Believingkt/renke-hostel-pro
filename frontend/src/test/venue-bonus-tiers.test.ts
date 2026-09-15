import { describe, expect, it } from "vitest";
import {
  pickCurrentVersion,
  pickTier,
  resolveVenueRate,
  type VenueTierRule,
} from "../../supabase/functions/_shared/venueBonusTiers";

const tiers = [
  { min_revenue: 1_000_000, rate: 0 },
  { min_revenue: 1_200_000, rate: 0.008 },
];

const rulesMap = (rows: VenueTierRule[]) =>
  new Map(rows.map((r) => [`${r.accommodation_id}|${r.bonus_type}`, r]));

describe("pickTier（整筆套用，非超額累進）", () => {
  it("低於最低門檻 → null（不發）", () => {
    expect(pickTier(tiers, 999_999)).toBeNull();
  });
  it("命中第一階 → rate 0", () => {
    expect(pickTier(tiers, 1_093_385)?.rate).toBe(0);
  });
  it("命中第二階 → rate 0.8%", () => {
    expect(pickTier(tiers, 1_200_000)?.rate).toBe(0.008);
    expect(pickTier(tiers, 5_000_000)?.rate).toBe(0.008);
  });
  it("亂序 tiers 仍正確排序判定", () => {
    expect(pickTier([...tiers].reverse(), 1_100_000)?.rate).toBe(0);
  });
});

describe("pickCurrentVersion", () => {
  const rows = [
    { effective_from: "2026-07-01", created_at: "a" },
    { effective_from: "2026-08-01", created_at: "b" },
    { effective_from: "2026-08-01", created_at: "c" },
    { effective_from: "2026-10-01", created_at: "d" },
  ];
  it("取 asOf 當時生效的最新版本（同日取 created_at 最新）", () => {
    expect(pickCurrentVersion(rows, "2026-09-01")?.created_at).toBe("c");
  });
  it("生效日晚於資料月 → 不採用", () => {
    expect(pickCurrentVersion(rows, "2026-07-15")?.created_at).toBe("a");
  });
  it("全部尚未生效 → null", () => {
    expect(pickCurrentVersion(rows, "2026-01-01")).toBeNull();
  });
});

describe("resolveVenueRate（前後端共用）", () => {
  const rules = rulesMap([
    {
      id: "rule-1",
      accommodation_id: "acc-yunxiu",
      bonus_type: "am_manager",
      effective_from: "2026-08-01",
      tiers,
    },
  ]);

  it("有級距的館：營收未達門檻 → 0%，並標記 tier_rule_id", () => {
    const r = resolveVenueRate(rules, "acc-yunxiu", "am_manager", 0.008, 1_093_385);
    expect(r.rate).toBe(0);
    expect(r.tierRuleId).toBe("rule-1");
    expect(r.tierMin).toBe(1_000_000);
  });

  it("有級距的館：營收達第二階 → 0.8%", () => {
    expect(resolveVenueRate(rules, "acc-yunxiu", "am_manager", 0.005, 1_500_000).rate).toBe(0.008);
  });

  it("查無規則的館 → fallback 系統費率", () => {
    const r = resolveVenueRate(rules, "acc-other", "am_manager", 0.008, 500_000);
    expect(r.rate).toBe(0.008);
    expect(r.tierRuleId).toBeNull();
  });

  it("同館不同獎金類型未設定 → fallback 系統費率", () => {
    expect(
      resolveVenueRate(rules, "acc-yunxiu", "closer_performance", 0.008, 1_093_385).rate,
    ).toBe(0.008);
  });

  it("完全無規則時，逐館加總等於「總營收 × 系統費率」（回歸相容）", () => {
    const empty = new Map<string, VenueTierRule>();
    const byAcc = { a: 411_220, b: 300_000, c: 0 };
    const sum = Object.entries(byAcc).reduce(
      (s, [id, rev]) => s + rev * resolveVenueRate(empty, id, "am_performance", 0.008, rev).rate,
      0,
    );
    expect(sum).toBeCloseTo(711_220 * 0.008, 6);
  });
});
