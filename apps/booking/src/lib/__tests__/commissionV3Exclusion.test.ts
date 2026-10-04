import { describe, it, expect } from "vitest";
import { commissionBaseFromOrder, getCommissionFormulaVersion } from "@/lib/ownerExempt";
import { excludedAddonTotal, ruleMonthStartOf } from "@/lib/commissionExclusionRule";
import { commissionBaseFromOrder as edgeBase } from "../../../../../supabase/functions/_shared/addonTotal";
import { getCommissionFormulaVersion as edgeVersion } from "../../../../../supabase/functions/_shared/commissionFormulaVersion";
import { excludedAddonTotal as edgeExcluded } from "../../../../../supabase/functions/_shared/commissionExclusionRule";

/**
 * V3（order_date 台北日 >= 2026-09-10）：
 *   base = max(0, final − 各館設定為「不列入抽成」的 custom addon − notes 現場加購)
 *   未設定規則／規則為空 → 不排除任何 custom addon（全部列入抽成）
 */
const onsiteNotes = (n: number) => `備註\n【額外現場加購金額 2026-09-20T10:00:00Z】\n${n}\n【額外現場加購金額END】`;
const V2_DATE = "2026-08-16T08:20:00Z";
const V3_DATE = "2026-09-15T02:00:00Z";

const addons = [
  { addon_id: "a1", addon_type: "加床", total: 1000 },
  { addon_id: "a2", addon_type: "寵物", total: 2000 },
];

describe("版本判定", () => {
  it("2026-09-09 台北 → V2；2026-09-10 台北 → V3", () => {
    expect(getCommissionFormulaVersion({ order_date: "2026-09-09T15:59:59Z" })).toBe("V2");
    expect(getCommissionFormulaVersion({ order_date: "2026-09-09T16:00:00Z" })).toBe("V3");
  });
  it("缺失／無效 → LEGACY", () => {
    expect(getCommissionFormulaVersion({})).toBe("LEGACY");
    expect(getCommissionFormulaVersion({ order_date: "bad" })).toBe("LEGACY");
  });
});

describe("V3 基準計算", () => {
  const order = { order_date: V3_DATE, final_price: 20000, custom_addon_details: addons, notes: onsiteNotes(500) };

  it("未設定規則 → 只扣現場加購，custom addon 全部列入抽成", () => {
    expect(commissionBaseFromOrder(order)).toBe(19500);
    expect(commissionBaseFromOrder(order, null)).toBe(19500);
  });
  it("規則為空陣列 → 等同未設定", () => {
    expect(
      commissionBaseFromOrder(order, {
        commission_excluded_addon_ids: [],
        commission_excluded_addon_types: [],
      }),
    ).toBe(19500);
  });
  it("依 addon_id 排除", () => {
    expect(
      commissionBaseFromOrder(order, {
        commission_excluded_addon_ids: ["a2"],
        commission_excluded_addon_types: [],
      }),
    ).toBe(17500);
  });
  it("無 addon_id 時以 addon_type 比對", () => {
    const legacyShape = { ...order, custom_addon_details: [{ addon_type: "加床", total: 1000 }] };
    expect(
      commissionBaseFromOrder(legacyShape, {
        commission_excluded_addon_ids: [],
        commission_excluded_addon_types: ["加床"],
      }),
    ).toBe(18500);
  });
  it("現場加購在 V3 一律排除", () => {
    expect(
      commissionBaseFromOrder(
        { ...order, custom_addon_details: [] },
        { commission_excluded_addon_ids: ["a1"], commission_excluded_addon_types: [] },
      ),
    ).toBe(19500);
  });
  it("永不為負", () => {
    expect(
      commissionBaseFromOrder(
        { order_date: V3_DATE, final_price: 300, custom_addon_details: addons, notes: onsiteNotes(500) },
        { commission_excluded_addon_ids: ["a1", "a2"], commission_excluded_addon_types: [] },
      ),
    ).toBe(0);
  });
});

describe("歷史不變（V3 規則不得回溯）", () => {
  it("V2 訂單忽略規則，仍扣所有 custom addon + onsite", () => {
    const o = { order_date: V2_DATE, final_price: 20000, custom_addon_details: addons, notes: onsiteNotes(500) };
    expect(commissionBaseFromOrder(o)).toBe(16500);
    expect(
      commissionBaseFromOrder(o, { commission_excluded_addon_ids: [], commission_excluded_addon_types: [] }),
    ).toBe(16500);
  });
  it("LEGACY 訂單仍不扣 onsite", () => {
    const o = { order_date: "2026-07-15T02:00:00Z", final_price: 20000, custom_addon_details: addons, notes: onsiteNotes(500) };
    expect(commissionBaseFromOrder(o)).toBe(17000);
  });
});

describe("ruleMonthStartOf 以台北月份為準", () => {
  it("2026-08-31T16:00:00Z（台北 9/1）→ 2026-09-01", () => {
    expect(ruleMonthStartOf("2026-08-31T16:00:00Z")).toBe("2026-09-01");
  });
  it("無效 → 空字串", () => {
    expect(ruleMonthStartOf(null)).toBe("");
  });
});

describe("frontend / Edge parity", () => {
  const rules = [
    null,
    { commission_excluded_addon_ids: [], commission_excluded_addon_types: [] },
    { commission_excluded_addon_ids: ["a1"], commission_excluded_addon_types: [] },
    { commission_excluded_addon_ids: [], commission_excluded_addon_types: ["寵物"] },
  ];
  const orders = [
    { order_date: V3_DATE, final_price: 20000, custom_addon_details: addons, notes: onsiteNotes(500) },
    { order_date: V2_DATE, final_price: 20000, custom_addon_details: addons, notes: onsiteNotes(500) },
    { order_date: null, final_price: 20000, custom_addon_details: addons, notes: onsiteNotes(500) },
  ];
  it("所有組合一致", () => {
    for (const o of orders) {
      expect(edgeVersion(o as any)).toBe(getCommissionFormulaVersion(o as any));
      for (const r of rules) {
        expect(edgeBase(o as any, r as any)).toBe(commissionBaseFromOrder(o as any, r as any));
        expect(edgeExcluded(o.custom_addon_details, r as any)).toBe(
          excludedAddonTotal(o.custom_addon_details, r as any),
        );
      }
    }
  });
});
