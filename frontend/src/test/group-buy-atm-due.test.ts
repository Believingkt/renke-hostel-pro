import { describe, it, expect } from "vitest";
import {
  resolveGroupBuyAtmDue,
  GB_ATM_ERR_NO_DEPOSIT,
} from "../../supabase/functions/_shared/groupBuyAtmDue";

describe("團購 ATM 應收金額 SoT", () => {
  it("CASE 5: 只採用 orders.deposit_amount，前端 amount 無法影響", () => {
    const r = resolveGroupBuyAtmDue({ deposit_amount: 3000, paid_amount: 0 });
    expect(r).toEqual({ ok: true, deposit: 3000, paid: 0, dueAmount: 3000 });
  });

  it("deposit_amount 缺失／為 0／非法 → 拒絕開立，不 fallback 重算", () => {
    for (const bad of [0, null, undefined, -100, "abc"] as unknown[]) {
      const r = resolveGroupBuyAtmDue({ deposit_amount: bad as number });
      expect(r.ok).toBe(false);
      if (r.ok === false) expect(r.error).toBe(GB_ATM_ERR_NO_DEPOSIT);
    }
  });

  it("CASE 6: 已取消訂單不可付款", () => {
    const r = resolveGroupBuyAtmDue({ order_status: "cancelled", deposit_amount: 3000 });
    expect(r.ok).toBe(false);
  });

  it("CASE 7: payment_status=paid 不可再開", () => {
    const r = resolveGroupBuyAtmDue({ payment_status: "paid", deposit_amount: 3000 });
    expect(r.ok).toBe(false);
  });

  it("CASE 7: deposit_paid 且 paid_amount >= deposit_amount → remainingDue<=0，禁止開立", () => {
    const r = resolveGroupBuyAtmDue({
      payment_status: "deposit_paid",
      deposit_amount: 3000,
      paid_amount: 3000,
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error).toContain("已收訖");
  });

  it("部分付款 → 只收剩餘差額", () => {
    const r = resolveGroupBuyAtmDue({
      payment_status: "deposit_paid",
      deposit_amount: 3000,
      paid_amount: 1200,
    });
    expect(r.ok && r.dueAmount).toBe(1800);
  });
});
