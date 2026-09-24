import { describe, it, expect } from "vitest";
import { isCommissionEligible } from "../../../../../supabase/functions/_shared/commissionEligibility";

const exemptKol = (o: any) => o.order_source === "kol";

const normalOrder = { order_source: "line", order_status: "confirmed" };
const kolOrder = { order_source: "kol", order_status: "confirmed" };

describe("isCommissionEligible", () => {
  it("CASE 1/7/8 一般單：不論旗標皆 eligible", () => {
    expect(isCommissionEligible(normalOrder, null, exemptKol)).toBe(true);
    expect(isCommissionEligible(normalOrder, { force_commission_eligible: false }, exemptKol)).toBe(true);
  });

  it("CASE 2/6 exempt + force=false/null/undefined → 排除", () => {
    expect(isCommissionEligible(kolOrder, null, exemptKol)).toBe(false);
    expect(isCommissionEligible(kolOrder, {}, exemptKol)).toBe(false);
    expect(isCommissionEligible(kolOrder, { force_commission_eligible: false }, exemptKol)).toBe(false);
  });

  it("CASE 3/4/5 exempt + force=true → eligible", () => {
    expect(isCommissionEligible(kolOrder, { force_commission_eligible: true }, exemptKol)).toBe(true);
  });
});

// ---- Scenario 純程式模擬（比照 create-commission-adjustments 的判定順序與公式）----

function scenarioA(order: any, meta: any, snap: any, paid: boolean) {
  if (order.order_status === "cancelled") return null;
  if (!paid) return null;
  if (order.currency_at_booking && order.currency_at_booking !== "TWD") return null;
  if (!isCommissionEligible(order, meta, exemptKol)) return null;
  const tcp = meta?.team_commission_price;
  const ordFinal = Number(order.final_price ?? 0);
  const currentBase = tcp == null || Number(tcp) === ordFinal ? ordFinal : Number(tcp);
  const snapBase = Number(snap.final_price_snapshot ?? 0);
  if (currentBase === snapBase) return null;
  return { type: "amount_change", closer_amount: (currentBase - snapBase) * Number(snap.closer_rate ?? 0) };
}

function scenarioB(order: any, meta: any, snap: any) {
  if (!isCommissionEligible(order, meta, exemptKol)) return null;
  return { type: "cancellation", closer_amount: -Number(snap.closer_commission_amount ?? 0) };
}

function scenarioC(order: any, meta: any, snap: any) {
  if (order.order_status === "cancelled") return null;
  if (!isCommissionEligible(order, meta, exemptKol)) return null;
  return { type: "reactivation", closer_amount: Number(snap.closer_commission_amount ?? 0) };
}

describe("PS3D35Z2 模擬（order_source=kol, force=true, 已 paid）", () => {
  const meta = { force_commission_eligible: true };
  const order = { order_source: "kol", order_status: "confirmed", final_price: 45000 };
  const snap = {
    final_price_snapshot: 42000,
    closer_rate: 0.025,
    closer_commission_amount: 1050,
  };

  it("CASE 9 / A：42,000 → 45,000, 2.5% → Gross +75", () => {
    expect(scenarioA(order, meta, snap, true)?.closer_amount).toBe(75);
  });

  it("CASE 4 / B：取消 → 全額扣回 -1050", () => {
    expect(scenarioB({ ...order, order_status: "cancelled" }, meta, snap)).toEqual({
      type: "cancellation",
      closer_amount: -1050,
    });
  });

  it("CASE 5 / C：恢復 → 補回 +1050", () => {
    expect(scenarioC(order, meta, snap)).toEqual({ type: "reactivation", closer_amount: 1050 });
  });

  it("CASE 11 / force=false 同單 A/B/C 仍全部排除", () => {
    const m = { force_commission_eligible: false };
    expect(scenarioA(order, m, snap, true)).toBeNull();
    expect(scenarioB({ ...order, order_status: "cancelled" }, m, snap)).toBeNull();
    expect(scenarioC(order, m, snap)).toBeNull();
  });

  it("CASE 12 / 一般 closer 單 A/B/C 行為不變", () => {
    const ordN = { ...order, order_source: "line" };
    expect(scenarioA(ordN, null, snap, true)?.closer_amount).toBe(75);
    expect(scenarioB({ ...ordN, order_status: "cancelled" }, null, snap)?.closer_amount).toBe(-1050);
    expect(scenarioC(ordN, null, snap)?.closer_amount).toBe(1050);
  });

  it("未 paid 時 A 仍交由 resync（不建立補差）", () => {
    expect(scenarioA(order, meta, snap, false)).toBeNull();
  });
});
