import { describe, expect, it } from "vitest";
import { splitRefundFee } from "@/lib/refundFee";
import { renderRefundProcessedEmail } from "../../supabase/functions/_shared/groupBuyEmail";

/** 後台「處理退款」Modal 顯示的三段金額（政策應退／手續費／實際匯回） */
describe("人工退款 Modal 金額切分", () => {
  it("gross 30 / fee 10 → payout 20", () => {
    expect(splitRefundFee({ gross: 30, configuredFee: 10 })).toEqual({ gross: 30, fee: 10, payout: 20 });
  });
  it("fee = 0 → payout = gross（不顯示手續費列）", () => {
    expect(splitRefundFee({ gross: 3000, configuredFee: 0 })).toEqual({ gross: 3000, fee: 0, payout: 3000 });
  });
  it("手續費不得超過退款總額，payout 不為負", () => {
    const s = splitRefundFee({ gross: 5, configuredFee: 30 });
    expect(s.fee).toBe(5);
    expect(s.payout).toBe(0);
  });
  it("信用卡退刷一律 fee = 0", () => {
    expect(splitRefundFee({ gross: 1000, configuredFee: 30, isCardRefund: true }).fee).toBe(0);
  });
  it("gross 為 0／負值 → 全 0", () => {
    expect(splitRefundFee({ gross: -100, configuredFee: 10 })).toEqual({ gross: 0, fee: 0, payout: 0 });
  });
});

const base = {
  orderNumber: "FC2B44G9",
  guestName: "測試",
  campaignTitle: "測試專案",
  checkIn: "2026-09-09",
  checkOut: "2026-09-10",
  refundAmount: 20,
  refundedTotal: 20,
  paidAmount: 30,
};

describe("退款完成通知信金額三段顯示", () => {
  it("銀行／ATM 有手續費 → 顯示政策應退、手續費、本次實際退款", () => {
    const html = renderRefundProcessedEmail({ ...base, refundFee: 10, refundFeeTotal: 10 } as never).html;
    expect(html).toContain("政策應退金額");
    expect(html).toContain("匯款手續費");
    expect(html).toContain("本次實際退款");
    expect(html).not.toContain("定金");
  });
  it("手續費 0 → 不出現手續費列", () => {
    const html = renderRefundProcessedEmail({ ...base, refundAmount: 30, refundedTotal: 30 } as never).html;
    expect(html).not.toContain("匯款手續費");
  });
  it("信用卡退刷 → 顯示原卡退刷且無手續費文案", () => {
    const html = renderRefundProcessedEmail({
      ...base,
      refundAmount: 1000,
      refundedTotal: 1000,
      paidAmount: 1000,
      paymentMethod: "credit_card",
      refundFee: 0,
    } as never).html;
    expect(html).toContain("原卡退刷");
    expect(html).not.toContain("匯款手續費");
  });
});
