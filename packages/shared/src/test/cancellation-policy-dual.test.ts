import { describe, expect, it } from "vitest";
import {
  daysUntil,
  depositRefundPercent,
  fullPrepaymentRefundPercent,
  quoteCancellation,
  resolveCancellationPolicy,
} from "../../../../supabase/functions/_shared/cancellationPolicy";

const CHECK_IN = "2026-09-20";
/** 回推「距入住 n 天」的取消日 */
const cancelDateFor = (n: number) =>
  new Date(Date.parse(`${CHECK_IN}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

describe("日期計算（Asia/Taipei 純日期）", () => {
  it("純日期天數差", () => {
    expect(daysUntil("2026-09-20", "2026-09-06")).toBe(14);
    expect(daysUntil("2026-09-20", "2026-09-20")).toBe(0);
    expect(daysUntil("2026-09-20", "2026-09-21")).toBe(-1);
  });
});

describe("CASE 1-11 邊界：訂金制級距", () => {
  const cases: Array<[number, number]> = [
    [20, 100], [14, 100], [13, 70], [10, 70], [9, 50], [7, 50],
    [6, 40], [4, 40], [3, 30], [2, 30], [1, 20], [0, 0], [-1, 0],
  ];
  it.each(cases)("距入住 %i 天 → 退 %i%%", (days, pct) => {
    expect(depositRefundPercent(days)).toBe(pct);
  });
});

describe("CASE 12-17 邊界：全額預收制級距", () => {
  const cases: Array<[number, number]> = [
    [14, 100], [4, 100], [3, 100], [2, 50], [1, 50], [0, 0], [-1, 0],
  ];
  it.each(cases)("距入住 %i 天 → 退 %i%%", (days, pct) => {
    expect(fullPrepaymentRefundPercent(days)).toBe(pct);
  });
});

describe("policy 判定：依付款制度，不得用金額反推", () => {
  it("團購銀行匯款 → deposit", () => {
    expect(resolveCancellationPolicy({
      order_source: "group_buy", payment_provider: "manual", payment_method: "bank_transfer",
      paid_amount: 5000, final_price: 5000,
    }).policy).toBe("deposit");
  });

  it("團購 ATM → deposit", () => {
    expect(resolveCancellationPolicy({
      order_source: "group_buy", payment_provider: "tappay", payment_method: "atm",
      paid_amount: 5000, final_price: 20000,
    }).policy).toBe("deposit");
  });

  it("團購信用卡 → full_prepayment", () => {
    expect(resolveCancellationPolicy({
      order_source: "group_buy", payment_provider: "tappay", payment_method: "credit_card",
      paid_amount: 20000, final_price: 20000,
    }).policy).toBe("full_prepayment");
  });

  it("一般訂房信用卡全額付款 → full_prepayment（不再用 14 天訂金級距）", () => {
    expect(resolveCancellationPolicy({
      order_source: "website", payment_method: "credit_card_3ds",
      paid_amount: 12000, final_price: 12000,
    }).policy).toBe("full_prepayment");
  });

  it("一般訂房 ATM → deposit（不得誤改）", () => {
    expect(resolveCancellationPolicy({
      order_source: "website", payment_method: "atm", paid_amount: 3000, final_price: 12000,
    }).policy).toBe("deposit");
  });

  it("一般訂房綁卡未扣款 → guarantee（維持既有級距）", () => {
    expect(resolveCancellationPolicy({
      order_source: "website", payment_method: "credit_card",
      room_charge_status: "card_bound", paid_amount: 0, final_price: 12000,
    }).policy).toBe("guarantee");
  });

  it("歷史訂單付款方式不明且已收款 → unknown + manual review", () => {
    const r = resolveCancellationPolicy({
      order_source: "website", payment_method: "legacy_unknown", paid_amount: 8000, final_price: 8000,
    });
    expect(r.policy).toBe("unknown");
    expect(r.requiresManualReview).toBe(true);
  });
});

describe("退款金額計算", () => {
  it("訂金制：基準為實收定金，非 final_price", () => {
    const q = quoteCancellation({
      order: {
        order_source: "group_buy", payment_method: "bank_transfer",
        paid_amount: 6000, final_price: 20000,
      },
      checkInDate: CHECK_IN,
      cancellationDate: cancelDateFor(12),
    });
    expect(q.policy).toBe("deposit");
    expect(q.baseAmount).toBe(6000);
    expect(q.refundPercent).toBe(70);
    expect(q.refundAmount).toBe(4200);
    expect(q.retainedAmount).toBe(1800);
  });

  it("全額預收制：前 2 日退 50%", () => {
    const q = quoteCancellation({
      order: {
        order_source: "website", payment_method: "credit_card_3ds",
        paid_amount: 12000, final_price: 12000,
      },
      checkInDate: CHECK_IN,
      cancellationDate: cancelDateFor(2),
    });
    expect(q.policy).toBe("full_prepayment");
    expect(q.refundAmount).toBe(6000);
  });

  it("全額預收制：當日取消 0%", () => {
    const q = quoteCancellation({
      order: {
        order_source: "website", payment_method: "credit_card_3ds",
        paid_amount: 12000, final_price: 12000,
      },
      checkInDate: CHECK_IN,
      cancellationDate: CHECK_IN,
    });
    expect(q.refundAmount).toBe(0);
    expect(q.retainedAmount).toBe(12000);
  });

  it("已退部分金額不重複退", () => {
    const q = quoteCancellation({
      order: {
        order_source: "group_buy", payment_method: "atm",
        paid_amount: 6000, final_price: 20000,
      },
      checkInDate: CHECK_IN,
      cancellationDate: cancelDateFor(20),
      alreadyRefunded: 2000,
    });
    expect(q.baseAmount).toBe(4000);
    expect(q.refundAmount).toBe(4000);
  });

  it("unknown policy → 不自動退款、標記人工確認", () => {
    const q = quoteCancellation({
      order: { order_source: "website", payment_method: "legacy_unknown", paid_amount: 8000, final_price: 8000 },
      checkInDate: CHECK_IN,
      cancellationDate: cancelDateFor(30),
    });
    expect(q.refundAmount).toBe(0);
    expect(q.requiresManualReview).toBe(true);
  });

  it("guarantee 制沿用既有違約金級距（regression）", () => {
    const q = quoteCancellation({
      order: {
        order_source: "website", payment_method: "credit_card",
        room_charge_status: "card_bound", paid_amount: 0, final_price: 10000,
      },
      checkInDate: CHECK_IN,
      cancellationDate: cancelDateFor(5),
      guaranteeBase: 10000,
    });
    expect(q.policy).toBe("guarantee");
    expect(q.feePercent).toBe(60);
    expect(q.feeAmount).toBe(6000);
  });
});
