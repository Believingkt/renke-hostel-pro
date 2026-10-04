import { describe, expect, it } from "vitest";
import { splitRefundFee } from "@/lib/refundFee";

// edge function 模組載入時會讀 Deno.env（寄信設定），測試環境提供最小 shim
(globalThis as unknown as { Deno?: unknown }).Deno ??= { env: { get: () => undefined } };
const { buildEmailOrder } = await import("../../../../supabase/functions/_shared/groupBuy.ts");
const { renderOrderCancelled, renderRefundProcessed } = await import(
  "../../../../supabase/functions/_shared/groupBuyEmail.ts"
);


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


const campaign = { title: "測試專案", deposit_percentage: 30, payment_deadline_hours: 72 };
const atmOrder = {
  order_number: "FC2B44G9",
  guest_name: "測試旅客",
  order_source: "group_buy",
  check_in_date: "2026-09-09",
  check_out_date: "2026-09-10",
  guest_count: 10,
  final_price: 1000,
  paid_amount: 30,
  deposit_amount: 30,
  refunded_amount: 0,
  created_at: "2026-08-24T00:00:00Z",
  payment_provider: "tappay",
  payment_method: "atm",
};
const cardOrder = {
  ...atmOrder,
  paid_amount: 1000,
  deposit_amount: 0,
  payment_method: "credit_card_3ds",
};
const build = (o: Record<string, unknown>) =>
  buildEmailOrder({ order: o, campaign, accommodationName: "雲岫", packageName: "包棟烤肉" });

describe("取消通知信：待退款三段顯示", () => {
  it("ATM 有手續費 → 政策應退／匯款手續費／預計實際退款", () => {
    const { html } = renderOrderCancelled(build(atmOrder), {
      cancelledAtText: "2026/09/01 10:00",
      paidAmount: 30,
      refundedTotal: 0,
      refundStatus: "pending_manual",
      handlingFee: 10,
    });
    expect(html).toContain("政策應退金額");
    expect(html).toContain("匯款手續費");
    expect(html).toContain("預計實際退款");
    expect(html).not.toContain("定金");
  });

  it("手續費 0 → 不顯示手續費列", () => {
    const { html } = renderOrderCancelled(build(atmOrder), {
      cancelledAtText: "2026/09/01 10:00",
      paidAmount: 30,
      refundedTotal: 0,
      refundStatus: "pending_manual",
      handlingFee: 0,
    });
    expect(html).not.toContain("匯款手續費");
  });
});

describe("退款完成通知信：三段顯示", () => {
  it("ATM 手續費 10 → 政策應退 30／手續費 10／本次實際退款 20", () => {
    const { html } = renderRefundProcessed(build(atmOrder), {
      refundAmount: 20,
      refundedTotal: 20,
      paidAmount: 30,
      refundStatus: "refunded",
      refundedAtText: "2026/09/02 10:00",
      refundFee: 10,
      refundFeeTotal: 10,
    });
    expect(html).toContain("政策應退金額");
    expect(html).toContain("本次實際退款");
    expect(html).not.toContain("定金");
  });

  it("信用卡退刷 → 無手續費文案，維持原卡退刷字樣", () => {
    const { html } = renderRefundProcessed(build(cardOrder), {
      refundAmount: 1000,
      refundedTotal: 1000,
      paidAmount: 1000,
      refundStatus: "refunded",
      refundedAtText: "2026/09/02 10:00",
    });
    expect(html).toContain("本次原卡退刷");
    expect(html).not.toContain("匯款手續費");
    expect(html).not.toContain("政策應退金額");
  });
});
