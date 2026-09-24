import { describe, expect, it } from "vitest";
import { computeRefundAmounts } from "../../../../supabase/functions/_shared/refundIdempotency";

// TapPay refunded_amount = 該交易累計退款額
const ev = (cumulative: number | null, amount: number | null = null) => ({
  incomingRefundedTotal: cumulative,
  fallbackAmount: amount,
});

describe("Q3-A TapPay 退款金額冪等", () => {
  it("CASE 1：付款 10000，退款 2000 → paid 8000 / refunded 2000", () => {
    const r = computeRefundAmounts({ currentPaid: 10000, currentRefundedTotal: 0, ...ev(2000, 2000) });
    expect(r).toEqual({ newPaid: 8000, newRefundedTotal: 2000, delta: 2000 });
  });

  it("CASE 2：同一退款 callback 重送 → paid 仍 8000 / refunded 仍 2000", () => {
    const r = computeRefundAmounts({ currentPaid: 8000, currentRefundedTotal: 2000, ...ev(2000, 2000) });
    expect(r).toEqual({ newPaid: 8000, newRefundedTotal: 2000, delta: 0 });
  });

  it("CASE 3：再退 1000（累計 3000）→ paid 7000 / refunded 3000", () => {
    const r = computeRefundAmounts({ currentPaid: 8000, currentRefundedTotal: 2000, ...ev(3000, 1000) });
    expect(r).toEqual({ newPaid: 7000, newRefundedTotal: 3000, delta: 1000 });
  });

  it("CASE 4：第二筆退款 callback 重送 → paid 仍 7000 / refunded 仍 3000", () => {
    const r = computeRefundAmounts({ currentPaid: 7000, currentRefundedTotal: 3000, ...ev(3000, 1000) });
    expect(r).toEqual({ newPaid: 7000, newRefundedTotal: 3000, delta: 0 });
  });

  it("CASE 5：全額退款 → paid 0", () => {
    const r = computeRefundAmounts({ currentPaid: 7000, currentRefundedTotal: 3000, ...ev(10000, 7000) });
    expect(r).toEqual({ newPaid: 0, newRefundedTotal: 10000, delta: 7000 });
    // 重送
    expect(computeRefundAmounts({ currentPaid: 0, currentRefundedTotal: 10000, ...ev(10000, 7000) }))
      .toEqual({ newPaid: 0, newRefundedTotal: 10000, delta: 0 });
  });

  it("CASE 6：部分付款（訂金 3000）後退款 3000 → 不得為負、不受 final_price 影響", () => {
    const r = computeRefundAmounts({ currentPaid: 3000, currentRefundedTotal: 0, ...ev(3000, 3000) });
    expect(r).toEqual({ newPaid: 0, newRefundedTotal: 3000, delta: 3000 });
    // 退款額大於已付額也不得負數
    expect(computeRefundAmounts({ currentPaid: 1000, currentRefundedTotal: 0, ...ev(5000, 5000) }).newPaid).toBe(0);
  });

  it("CASE 7：亂序／舊事件重送（累計金額較小）不得再次扣減或回退", () => {
    const r = computeRefundAmounts({ currentPaid: 7000, currentRefundedTotal: 3000, ...ev(2000, 2000) });
    expect(r).toEqual({ newPaid: 7000, newRefundedTotal: 3000, delta: 0 });
  });

  it("CASE 8：payload 缺 refunded_amount 時採保守 max，不重複扣減", () => {
    const first = computeRefundAmounts({ currentPaid: 10000, currentRefundedTotal: 0, ...ev(null, 2000) });
    expect(first).toEqual({ newPaid: 8000, newRefundedTotal: 2000, delta: 2000 });
    const resend = computeRefundAmounts({ currentPaid: 8000, currentRefundedTotal: 2000, ...ev(null, 2000) });
    expect(resend.delta).toBe(0);
    expect(resend.newPaid).toBe(8000);
  });
});
