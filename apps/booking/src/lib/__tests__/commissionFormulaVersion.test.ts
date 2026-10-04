import { describe, it, expect } from "vitest";
import {
  commissionBaseFromOrder,
  getCommissionFormulaVersion,
} from "@/lib/ownerExempt";
import { commissionBaseFromOrder as edgeBase } from "../../../../../supabase/functions/_shared/addonTotal";
import { getCommissionFormulaVersion as edgeVersion } from "../../../../../supabase/functions/_shared/commissionFormulaVersion";

/**
 * Commission formula 版本化：cutoff 2026-08-01 00:00 Asia/Taipei，SoT = orders.order_date。
 * LEGACY：final − custom addon（onsite 不扣）
 * V2    ：final − custom addon − onsite
 * missing / invalid order_date → fail-safe LEGACY
 */
const onsiteNotes = (n: number) => `備註\n【額外現場加購金額 2026-08-29T10:00:00Z】\n${n}\n【額外現場加購金額END】`;
const addon = (total: number) => [{ addon_type: "加床", total }];

const LEGACY_DATE = "2026-07-15T02:00:00Z"; // 台北 2026-07-15
const NEW_DATE = "2026-08-16T08:20:00Z"; // 台北 2026-08-16

/** 呼叫端 override 語意：tcp !== null/undefined && tcp !== final_price → true override */
function resolveBase(order: any) {
  const tcp = order.team_commission_price;
  if (tcp !== null && tcp !== undefined && tcp !== order.final_price) return tcp;
  return commissionBaseFromOrder(order);
}

describe("formula matrix CASE A–J", () => {
  it("CASE A LEGACY 無加購 → final", () => {
    expect(resolveBase({ order_date: LEGACY_DATE, final_price: 20000, custom_addon_details: [] })).toBe(20000);
  });
  it("CASE B LEGACY custom 2000 + onsite 3000 / final 25000 → 23000（onsite 不扣）", () => {
    expect(
      resolveBase({ order_date: LEGACY_DATE, final_price: 25000, custom_addon_details: addon(2000), notes: onsiteNotes(3000) }),
    ).toBe(23000);
  });
  it("CASE C NEW 同條件 → 20000", () => {
    expect(
      resolveBase({ order_date: NEW_DATE, final_price: 25000, custom_addon_details: addon(2000), notes: onsiteNotes(3000) }),
    ).toBe(20000);
  });
  it("CASE D LEGACY true override 18000 → 18000", () => {
    expect(
      resolveBase({ order_date: LEGACY_DATE, final_price: 25000, custom_addon_details: addon(2000), notes: onsiteNotes(3000), team_commission_price: 18000 }),
    ).toBe(18000);
  });
  it("CASE E NEW true override 18000 → 18000", () => {
    expect(
      resolveBase({ order_date: NEW_DATE, final_price: 25000, custom_addon_details: addon(2000), notes: onsiteNotes(3000), team_commission_price: 18000 }),
    ).toBe(18000);
  });
  it("CASE F tcp = 0 為合法 override，LEGACY / NEW 皆 0", () => {
    expect(resolveBase({ order_date: LEGACY_DATE, final_price: 25000, team_commission_price: 0 })).toBe(0);
    expect(resolveBase({ order_date: NEW_DATE, final_price: 25000, team_commission_price: 0 })).toBe(0);
  });
  it("CASE G tcp == final（非 override）LEGACY → final − custom", () => {
    expect(
      resolveBase({ order_date: LEGACY_DATE, final_price: 25000, custom_addon_details: addon(2000), notes: onsiteNotes(3000), team_commission_price: 25000 }),
    ).toBe(23000);
  });
  it("CASE H tcp == final NEW → final − custom − onsite", () => {
    expect(
      resolveBase({ order_date: NEW_DATE, final_price: 25000, custom_addon_details: addon(2000), notes: onsiteNotes(3000), team_commission_price: 25000 }),
    ).toBe(20000);
  });
  it("CASE I missing order_date → LEGACY fail-safe", () => {
    expect(getCommissionFormulaVersion({})).toBe("LEGACY");
    expect(getCommissionFormulaVersion({ order_date: null })).toBe("LEGACY");
    expect(commissionBaseFromOrder({ final_price: 25000, notes: onsiteNotes(3000) })).toBe(25000);
  });
  it("CASE J invalid order_date → LEGACY fail-safe", () => {
    expect(getCommissionFormulaVersion({ order_date: "not-a-date" })).toBe("LEGACY");
    expect(commissionBaseFromOrder({ order_date: "not-a-date", final_price: 25000, notes: onsiteNotes(3000) })).toBe(25000);
  });
});

describe("cutoff boundary CASE K–M（Asia/Taipei）", () => {
  it("CASE K 2026-07-31T15:59:59Z → 台北 07-31 → LEGACY", () => {
    expect(getCommissionFormulaVersion({ order_date: "2026-07-31T15:59:59Z" })).toBe("LEGACY");
  });
  it("CASE L 2026-07-31T16:00:00Z → 台北 08-01 → V2", () => {
    expect(getCommissionFormulaVersion({ order_date: "2026-07-31T16:00:00Z" })).toBe("V2");
  });
  it("CASE M 2026-08-01T00:00:00+08:00 → V2", () => {
    expect(getCommissionFormulaVersion({ order_date: "2026-08-01T00:00:00+08:00" })).toBe("V2");
  });
});

describe("production regression fixtures", () => {
  it("QT7Z85E8（台北 2026-08-16, onsite 3650）→ V2, base 6266", () => {
    const o = { order_date: "2026-08-16T08:20:17.936343Z", final_price: 9916, custom_addon_details: [], notes: onsiteNotes(3650) };
    expect(getCommissionFormulaVersion(o)).toBe("V2");
    expect(resolveBase(o)).toBe(6266);
  });

  // 24 筆 LEGACY 母體代表性樣本：onsite > 0 但一律不扣
  const legacySamples: Array<[string, string, number, number]> = [
    ["GQ5L29H7", "2026-03-30T02:00:00Z", 47100, 3600],
    ["BQ4K72T2", "2026-06-03T02:00:00Z", 26500, 7500],
    ["JD2U79A7", "2026-06-15T02:00:00Z", 64215, 4000],
    ["DG3N46Q5", "2026-06-30T02:00:00Z", 20000, 1200],
    ["YC6U86W2", "2026-07-08T02:00:00Z", 30000, 2000],
    ["YC9J79T9", "2026-07-18T02:00:00Z", 18000, 1500],
    ["MH3T76Y3", "2026-07-30T02:00:00Z", 22000, 800],
  ];
  it.each(legacySamples)("%s → LEGACY，onsite 不扣", (_n, date, final, onsite) => {
    const o = { order_date: date, final_price: final, custom_addon_details: [], notes: onsiteNotes(onsite) };
    expect(getCommissionFormulaVersion(o)).toBe("LEGACY");
    expect(commissionBaseFromOrder(o)).toBe(final);
  });

  it("PW3E89S2（台北 2026-08-24, onsite 0, true override 11000）→ base 11000", () => {
    const o = { order_date: "2026-08-24T02:00:00Z", final_price: 12000, custom_addon_details: [], notes: null, team_commission_price: 11000 };
    expect(getCommissionFormulaVersion(o)).toBe("V2");
    expect(resolveBase(o)).toBe(11000);
  });
});

describe("frontend / Edge parity", () => {
  const fixtures = [
    { order_date: LEGACY_DATE, final_price: 25000, custom_addon_details: addon(2000), notes: onsiteNotes(3000) },
    { order_date: NEW_DATE, final_price: 25000, custom_addon_details: addon(2000), notes: onsiteNotes(3000) },
    { order_date: null, final_price: 25000, custom_addon_details: [], notes: onsiteNotes(3000) },
    { order_date: "bad", final_price: 25000, custom_addon_details: [], notes: onsiteNotes(3000) },
    { order_date: "2026-07-31T15:59:59Z", final_price: 9916, custom_addon_details: [], notes: onsiteNotes(3650) },
    { order_date: "2026-07-31T16:00:00Z", final_price: 9916, custom_addon_details: [], notes: onsiteNotes(3650) },
    { order_date: "2026-08-01T00:00:00+08:00", final_price: 1000, custom_addon_details: addon(2000), notes: null },
  ];
  it.each(fixtures)("parity %#", (f: any) => {
    expect(edgeVersion(f)).toBe(getCommissionFormulaVersion(f));
    expect(edgeBase(f)).toBe(commissionBaseFromOrder(f));
  });
});
