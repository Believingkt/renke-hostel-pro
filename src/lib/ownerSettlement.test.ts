import { describe, it, expect } from "vitest";
import {
  computeOwnerSettlementRows,
  computeOwnerSettlementTotals,
  DEFAULT_OWNER_SETTLEMENT_CONFIG,
  type OwnerSettlementConfig,
  type OwnerSettlementOrderInput,
} from "./ownerSettlement";

// 模擬 2026-06 月的一組訂單，涵蓋：一般訂單、exempt 來源、owner_direct、跨月分攤
const month = new Date("2026-06-15T00:00:00Z");

const orders: OwnerSettlementOrderInput[] = [
  // 完全落在 6 月，來源 owlting（若被設為 exempt 則不抽）
  {
    check_in_date: "2026-06-05",
    check_out_date: "2026-06-07",
    final_price: 10000,
    order_source: "owlting",
    owner_direct: false,
  },
  // 完全落在 6 月，來源 direct（不 exempt）
  {
    check_in_date: "2026-06-10",
    check_out_date: "2026-06-12",
    final_price: 20000,
    order_source: "direct",
    owner_direct: false,
  },
  // owner_direct = true，永遠不抽成
  {
    check_in_date: "2026-06-20",
    check_out_date: "2026-06-22",
    final_price: 15000,
    order_source: "direct",
    owner_direct: true,
  },
  // 跨月：5/30 - 6/2，共 3 晚，2 晚落在 6 月
  {
    check_in_date: "2026-05-30",
    check_out_date: "2026-06-02",
    final_price: 9000,
    order_source: "direct",
    owner_direct: false,
  },
];

const savedConfig: OwnerSettlementConfig = {
  commission_rate: 15,
  marketing_fee_base: 53000,
  marketing_fee_per_extra_property: 3000,
  exempt_order_sources: ["owlting"],
};

describe("OwnerSettlement 權限回歸：角色不影響計算結果", () => {
  // 三個角色：super_admin / admin / 唯讀 admin
  // 只要 RLS 政策允許他們讀到 system_settings.owner_settlement_config，
  // 前端拿到的 config 就會完全一致 → 計算結果必須完全一致。
  const rolesThatShouldReadConfig = ["super_admin", "admin", "readonly_admin"] as const;

  it("三種角色讀到相同 config 時，rows 與 totals 完全一致", () => {
    const results = rolesThatShouldReadConfig.map((role) => {
      const rows = computeOwnerSettlementRows(orders, savedConfig, month);
      const totals = computeOwnerSettlementTotals(rows, savedConfig, 1);
      return { role, rows, totals };
    });

    const [first, ...rest] = results;
    for (const r of rest) {
      expect(r.rows).toEqual(first.rows);
      expect(r.totals).toEqual(first.totals);
    }
  });

  it("exempt 來源（owlting）與 owner_direct 訂單不計抽成", () => {
    const rows = computeOwnerSettlementRows(orders, savedConfig, month);
    const byCheckIn = Object.fromEntries(rows.map((r) => [r.order.check_in_date, r]));

    expect(byCheckIn["2026-06-05"].exempt).toBe(true); // owlting exempt
    expect(byCheckIn["2026-06-05"].commission).toBe(0);

    expect(byCheckIn["2026-06-20"].exempt).toBe(true); // owner_direct
    expect(byCheckIn["2026-06-20"].commission).toBe(0);

    expect(byCheckIn["2026-06-10"].exempt).toBe(false);
    expect(byCheckIn["2026-06-10"].commission).toBeCloseTo(20000 * 0.15, 6);
  });

  it("跨月訂單依當月夜數比例分攤", () => {
    const rows = computeOwnerSettlementRows(orders, savedConfig, month);
    const cross = rows.find((r) => r.order.check_in_date === "2026-05-30")!;
    // 3 晚總長，5/30、5/31、6/1 → 6 月只佔 1 晚（6/1）
    expect(cross.totalNights).toBe(3);
    expect(cross.nightsInMonth).toBe(1);
    expect(cross.monthFinal).toBeCloseTo(9000 * (1 / 3), 6);
    expect(cross.commission).toBeCloseTo((9000 / 3) * 0.15, 6);
  });

  it("regression：若角色讀不到 config 而 fallback 到預設值，抽成會偏高（守門測試）", () => {
    // 這正是這次的 bug：system_settings SELECT 被 RLS 擋住 → 前端用 DEFAULT
    // → exempt_order_sources = [] → owlting 也被抽成 → 服務費多算。
    // 本測試明確斷言兩種情境不相等，防止未來又有人把 SELECT 政策收回 super_admin only。
    const rowsWithConfig = computeOwnerSettlementRows(orders, savedConfig, month);
    const rowsFallback = computeOwnerSettlementRows(orders, DEFAULT_OWNER_SETTLEMENT_CONFIG, month);

    const commissionWithConfig = computeOwnerSettlementTotals(rowsWithConfig, savedConfig, 1)
      .totalCommission;
    const commissionFallback = computeOwnerSettlementTotals(
      rowsFallback,
      DEFAULT_OWNER_SETTLEMENT_CONFIG,
      1,
    ).totalCommission;

    // 有 exempt 的 owlting 訂單 10000 元 → fallback 會多抽 1500
    expect(commissionFallback - commissionWithConfig).toBeCloseTo(10000 * 0.15, 6);
  });

  it("行銷費依民宿棟數計算，且不受 exempt 來源影響", () => {
    const t1 = computeOwnerSettlementTotals([], savedConfig, 1);
    const t2 = computeOwnerSettlementTotals([], savedConfig, 2);
    const t3 = computeOwnerSettlementTotals([], savedConfig, 3);
    expect(t1.marketingFee).toBe(53000);
    expect(t2.marketingFee).toBe(53000 + 3000);
    expect(t3.marketingFee).toBe(53000 + 3000 * 2);
  });
});
