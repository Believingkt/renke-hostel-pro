/**
 * Phase G2-ATM-FEE-IMPLEMENT V2｜人工退款手續費（館別可設定）
 *
 * 帳務模型：
 *   settledRefund = refunded_amount(實退旅客) + refund_fee_amount(手續費)
 *   remainingRefundable = paid_amount - settledRefund
 * 規則：手續費金額一律來自館別設定，信用卡原卡退刷一律 0，且不得寫死 30。
 */
import { describe, expect, it } from "vitest";
import {
  remainingRefundableWithFee,
  settledRefund,
  splitRefundFee,
} from "../../../../supabase/functions/_shared/refundFee";
import { remainingRefundable as adapterRemaining } from "../../../../supabase/functions/_shared/paymentAdapter";
import { refundState, remainingRefundable as clientRemaining } from "@lakeze/shared/lib/groupBuyPayment";
import { refundFeeText } from "@lakeze/shared/lib/refundPolicy";

describe("手續費切分", () => {
  it("館別設定 30：3000 → 手續費 30、實退 2970", () => {
    expect(splitRefundFee({ gross: 3000, configuredFee: 30 })).toEqual({ gross: 3000, fee: 30, payout: 2970 });
  });

  it("館別設定 0：不扣手續費", () => {
    expect(splitRefundFee({ gross: 3000, configuredFee: 0 })).toEqual({ gross: 3000, fee: 0, payout: 3000 });
  });

  it("館別設定 50：每館可不同", () => {
    expect(splitRefundFee({ gross: 1000, configuredFee: 50 })).toEqual({ gross: 1000, fee: 50, payout: 950 });
  });

  it("信用卡原卡退刷一律不收手續費", () => {
    expect(splitRefundFee({ gross: 1000, configuredFee: 30, isCardRefund: true }))
      .toEqual({ gross: 1000, fee: 0, payout: 1000 });
  });

  it("手續費不得超過退款總額，也不得為負", () => {
    expect(splitRefundFee({ gross: 20, configuredFee: 30 })).toEqual({ gross: 20, fee: 20, payout: 0 });
    expect(splitRefundFee({ gross: 100, configuredFee: -5 })).toEqual({ gross: 100, fee: 0, payout: 100 });
  });
});

describe("已沖銷與可退餘額", () => {
  const o = { paid_amount: 3000, refunded_amount: 2970, refund_fee_amount: 30 };

  it("settled = 實退 + 手續費，全額退款後不得再退", () => {
    expect(settledRefund(o)).toBe(3000);
    expect(remainingRefundableWithFee(o)).toBe(0);
    expect(adapterRemaining(o)).toBe(0);
    expect(clientRemaining(o)).toBe(0);
  });

  it("部分退款：餘額扣掉手續費", () => {
    const p = { paid_amount: 3000, refunded_amount: 970, refund_fee_amount: 30 };
    expect(remainingRefundableWithFee(p)).toBe(2000);
    expect(adapterRemaining(p)).toBe(2000);
    expect(clientRemaining(p)).toBe(2000);
  });

  it("舊資料無 refund_fee_amount → 行為與過去一致", () => {
    const legacy = { paid_amount: 3000, refunded_amount: 1000 };
    expect(remainingRefundableWithFee(legacy)).toBe(2000);
    expect(adapterRemaining(legacy)).toBe(2000);
  });

  it("退款狀態：實退 + 手續費 = 已收 → 視為已退款完成", () => {
    expect(refundState({ order_status: "cancelled", ...o, refund_status: "refunded" })).toBe("refunded");
  });
});

describe("文案不得寫死金額", () => {
  it("fee = 0 → 不輸出手續費文案", () => {
    expect(refundFeeText(0)).toBeNull();
  });
  it("fee > 0 → 依設定金額輸出", () => {
    expect(refundFeeText(30)).toBe("退款將扣除 NT$30 匯款手續費。");
    expect(refundFeeText(80)).toBe("退款將扣除 NT$80 匯款手續費。");
  });
});
