import { describe, expect, it } from "vitest";
import { quoteCancellation } from "../../supabase/functions/_shared/cancellationPolicy";

/**
 * Phase F2-F 二、「實收 < 名目訂金」防超退
 * 訂金制退款基準必須是「實際已收金額」，不可用 deposit_amount 或 final_price。
 */
const baseOrder = {
  order_source: "group_buy",
  payment_method: "bank_transfer",
  final_price: 20000,
  deposit_amount: 6000,
  paid_amount: 3000,
};

describe("實收少於名目訂金：退款基準只能是實收", () => {
  it("入住前 10~13 日（70%）→ 2,100，不得為 4,200 或 14,000", () => {
    const q = quoteCancellation({
      order: baseOrder,
      checkInDate: "2026-09-20",
      cancellationDate: "2026-09-08", // 12 天前
      alreadyRefunded: 0,
    });
    expect(q.policy).toBe("deposit");
    expect(q.daysBefore).toBe(12);
    expect(q.refundPercent).toBe(70);
    expect(q.baseAmount).toBe(3000);
    expect(q.refundAmount).toBe(2100);
    expect(q.refundAmount).not.toBe(4200);
    expect(q.refundAmount).not.toBe(14000);
  });

  it.each([
    [30, 100, 3000],
    [14, 100, 3000],
    [12, 70, 2100],
    [8, 50, 1500],
    [5, 40, 1200],
    [2, 30, 900],
    [1, 20, 600],
    [0, 0, 0],
  ])("距入住 %i 日 → %i%% → 退 %i（一律 ≤ 實收 3,000）", (days, pct, expected) => {
    const cancellationDate = new Date(
      Date.parse("2026-09-20T00:00:00Z") - days * 86400000,
    ).toISOString().slice(0, 10);
    const q = quoteCancellation({ order: baseOrder, checkInDate: "2026-09-20", cancellationDate });
    expect(q.refundPercent).toBe(pct);
    expect(q.refundAmount).toBe(expected);
    expect(q.refundAmount).toBeLessThanOrEqual(3000);
  });

  it("已有 refunded_amount 時不得超退（已退 1,000 → 最多再退 2,000）", () => {
    const q = quoteCancellation({
      order: baseOrder,
      checkInDate: "2026-09-20",
      cancellationDate: "2026-08-20", // 100% 級距
      alreadyRefunded: 1000,
    });
    expect(q.refundPercent).toBe(100);
    expect(q.baseAmount).toBe(2000);
    expect(q.refundAmount).toBe(2000);
  });

  it("已全額退款後再次報價 → 0", () => {
    const q = quoteCancellation({
      order: baseOrder,
      checkInDate: "2026-09-20",
      cancellationDate: "2026-08-20",
      alreadyRefunded: 3000,
    });
    expect(q.refundAmount).toBe(0);
    expect(q.baseAmount).toBe(0);
  });

  it("退款紀錄大於實收（資料異常）也不得算出負數或超退", () => {
    const q = quoteCancellation({
      order: baseOrder,
      checkInDate: "2026-09-20",
      cancellationDate: "2026-08-20",
      alreadyRefunded: 5000,
    });
    expect(q.refundAmount).toBe(0);
  });

  it("信用卡全額預收但實收不足（3,000/20,000）→ 判為訂金制，基準仍是實收", () => {
    const q = quoteCancellation({
      order: {
        order_source: "booking",
        payment_method: "credit_card",
        final_price: 20000,
        deposit_amount: 6000,
        paid_amount: 3000,
      },
      checkInDate: "2026-09-20",
      cancellationDate: "2026-09-08",
    });
    expect(q.policy).toBe("deposit");
    expect(q.baseAmount).toBe(3000);
    expect(q.refundAmount).toBe(2100);
  });
});
