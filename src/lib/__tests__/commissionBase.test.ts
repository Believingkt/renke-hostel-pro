import { describe, it, expect } from "vitest";
import { commissionBaseFromOrder } from "@/lib/ownerExempt";
import { extraOnSiteAddonFromNotes } from "@/lib/orderAddonTotal";

/**
 * 分潤基準修正 Phase 1：
 * canonical formula = max(0, final_price − Σ custom_addon_details.total − onsite extra(notes))
 * team_commission_price 人工覆蓋值優先，且不得再扣任何加購（no double exclusion）。
 */
const onsiteNotes = (n: number) => `備註\n【額外現場加購金額 2026-08-29T10:00:00Z】\n${n}\n【額外現場加購金額END】`;
const addon = (total: number) => [{ addon_type: "加床", total }];

/** 呼叫端既有 override 語意：tcp !== null && tcp !== final_price → 真正人工覆蓋 */
function resolveBase(order: {
  final_price: number;
  custom_addon_details?: unknown;
  notes?: string | null;
  team_commission_price?: number | null;
}) {
  const tcp = order.team_commission_price;
  if (tcp !== null && tcp !== undefined && tcp !== order.final_price) return tcp;
  return commissionBaseFromOrder(order);
}

describe("commission base — 基本公式 CASE A~F", () => {
  it("CASE A 只有住宿", () => {
    expect(resolveBase({ final_price: 20000, custom_addon_details: [], notes: null })).toBe(20000);
  });
  it("CASE B 只有 custom addon", () => {
    expect(resolveBase({ final_price: 22000, custom_addon_details: addon(2000) })).toBe(20000);
  });
  it("CASE C 只有 onsite", () => {
    expect(resolveBase({ final_price: 23000, custom_addon_details: [], notes: onsiteNotes(3000) })).toBe(20000);
  });
  it("CASE D 兩種 addon 都有", () => {
    expect(
      resolveBase({ final_price: 25000, custom_addon_details: addon(2000), notes: onsiteNotes(3000) }),
    ).toBe(20000);
  });
  it("CASE E 人工 override 不得再扣加購", () => {
    expect(
      resolveBase({
        final_price: 25000,
        custom_addon_details: addon(2000),
        notes: onsiteNotes(3000),
        team_commission_price: 18000,
      }),
    ).toBe(18000);
  });
  it("CASE F tcp == final_price 視為非真正 override", () => {
    expect(
      resolveBase({
        final_price: 25000,
        custom_addon_details: addon(2000),
        notes: onsiteNotes(3000),
        team_commission_price: 25000,
      }),
    ).toBe(20000);
  });
  it("永不為負", () => {
    expect(commissionBaseFromOrder({ final_price: 1000, custom_addon_details: addon(2000) })).toBe(0);
  });
});

describe("onsite notes parser contract", () => {
  it("沒有 block → 0", () => {
    expect(extraOnSiteAddonFromNotes(null)).toBe(0);
    expect(extraOnSiteAddonFromNotes("一般備註")).toBe(0);
  });
  it("正常 block", () => {
    expect(extraOnSiteAddonFromNotes(onsiteNotes(3650))).toBe(3650);
  });
  it("malformed block → 0（安全 fallback）", () => {
    expect(extraOnSiteAddonFromNotes("【額外現場加購金額】1200")).toBe(0);
    expect(extraOnSiteAddonFromNotes("【額外現場加購金額】abc【額外現場加購金額END】")).toBe(0);
  });
  it("負數 / 千分位 / 小數：沿用既有 contract（只吃連續數字）", () => {
    expect(extraOnSiteAddonFromNotes("【額外現場加購金額】-500【額外現場加購金額END】")).toBe(0);
    expect(extraOnSiteAddonFromNotes("【額外現場加購金額】1,200【額外現場加購金額END】")).toBe(0);
    expect(extraOnSiteAddonFromNotes("【額外現場加購金額】1200.5【額外現場加購金額END】")).toBe(0);
  });
  it("只取目前有效 block（第一個完整區塊）", () => {
    expect(extraOnSiteAddonFromNotes(`${onsiteNotes(500)}\n其他備註`)).toBe(500);
  });
});

describe("實單唯讀 regression fixtures", () => {
  it("QT7Z85E8 → 6266", () => {
    expect(resolveBase({ final_price: 9916, custom_addon_details: [], notes: onsiteNotes(3650) })).toBe(6266);
  });
  it("TR9L92F7 → 43500", () => {
    expect(resolveBase({ final_price: 47100, custom_addon_details: [], notes: onsiteNotes(3600) })).toBe(43500);
  });
  it("XH2B33F6（tcp == final）→ 60215", () => {
    expect(
      resolveBase({
        final_price: 64215,
        custom_addon_details: [],
        notes: onsiteNotes(4000),
        team_commission_price: 64215,
      }),
    ).toBe(60215);
  });
  it("US2F38X4（人工 tcp = final − onsite）維持人工值，不 double subtract", () => {
    expect(
      resolveBase({
        final_price: 26500,
        custom_addon_details: [],
        notes: onsiteNotes(7500),
        team_commission_price: 19000,
      }),
    ).toBe(19000);
  });
});
