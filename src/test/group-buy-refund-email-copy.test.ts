/**
 * Phase F3-C4｜團購取消／退款 Email 依「實際付款方式＋退款狀態」分流
 *
 * 驗證重點：
 *  - 信用卡（tappay）訂單不得出現訂金／尾款／銀行人工退款排程／NT$30 匯款手續費
 *  - 銀行匯款（manual）維持原本人工退款文案
 *  - ATM 不得被誤判為信用卡
 *  - 金額一律來自呼叫端（server/DB），template 不自算比例
 */
import { describe, expect, it } from "vitest";

// edge function 模組在載入時會讀 Deno.env（寄信設定），測試環境提供最小 shim
(globalThis as unknown as { Deno?: unknown }).Deno ??= { env: { get: () => undefined } };

const { buildEmailOrder } = await import("../../supabase/functions/_shared/groupBuy.ts");
const { renderOrderCancelled, renderRefundProcessed } = await import(
  "../../supabase/functions/_shared/groupBuyEmail.ts"
);


const campaign = { title: "10人包棟烤肉專案（測試）", deposit_percentage: 30, payment_deadline_hours: 72 };

const baseOrder = {
  order_number: "DB3U47P4",
  guest_name: "測試旅客",
  order_source: "group_buy",
  check_in_date: "2026-09-09",
  check_out_date: "2026-09-10",
  guest_count: 10,
  final_price: 1000,
  paid_amount: 1000,
  deposit_amount: 0,
  refunded_amount: 0,
  created_at: "2026-08-24T00:00:00Z",
};

const cardOrder = {
  ...baseOrder,
  payment_provider: "tappay",
  payment_method: "credit_card_3ds",
};

const bankOrder = {
  ...baseOrder,
  payment_provider: "manual",
  payment_method: "bank_transfer",
  paid_amount: 300,
  deposit_amount: 300,
};

const atmOrder = {
  ...baseOrder,
  payment_provider: "tappay",
  payment_method: "atm",
  paid_amount: 300,
  deposit_amount: 300,
};

const build = (order: Record<string, unknown>) =>
  buildEmailOrder({ order, campaign, accommodationName: "雲岫", packageName: "包棟烤肉" });

const BANK_ONLY_STRINGS = ["應付訂金", "入住現場付清", "匯款手續費", "本月最後一天退款"];

describe("F3-C4 group buy cancel/refund email copy", () => {
  it("SoT：信用卡判定與 server 一致；ATM 不得誤判", () => {
    expect(build(cardOrder).isCardOrder).toBe(true);
    expect(build(cardOrder).fullPrepayment).toBe(true);
    expect(build(atmOrder).isCardOrder).toBe(false);
    expect(build(bankOrder).isCardOrder).toBe(false);
  });

  it("CASE 8：信用卡取消信不得出現訂金／尾款／銀行排程／NT$30", () => {
    const { html } = renderOrderCancelled(build(cardOrder), {
      cancelledAtText: "2026/08/24 16:00",
      paidAmount: 1000,
      refundedTotal: 0,
      refundStatus: "pending_manual",
    });
    for (const s of BANK_ONLY_STRINGS) expect(html).not.toContain(s);
    expect(html).toContain("原信用卡退刷（TapPay）");
    expect(html).toContain("原信用卡退刷處理中");
    expect(html).toContain("NT$ 1,000");
  });

  it("D：信用卡 pending refund 顯示預計原卡退刷金額與 3～7 工作天", () => {
    const { html } = renderOrderCancelled(build(cardOrder), {
      cancelledAtText: "2026/08/24 16:00",
      paidAmount: 1000,
      refundedTotal: 0,
      refundStatus: "pending_manual",
    });
    expect(html).toContain("預計原卡退刷");
    expect(html).toContain("3～7 個工作天");
  });

  it("CASE 1：信用卡全額退款完成信文案", () => {
    const { subject, html } = renderRefundProcessed(build(cardOrder), {
      refundAmount: 1000,
      refundedTotal: 1000,
      paidAmount: 1000,
      refundStatus: "refunded",
      refundedAtText: "2026/08/24 17:00",
    });
    expect(subject).toContain("退款完成");
    expect(html).toContain("信用卡（TapPay 原卡退刷）");
    expect(html).toContain("本次原卡退刷");
    expect(html).toContain("退款完成");
    for (const s of BANK_ONLY_STRINGS) expect(html).not.toContain(s);
    expect(html).not.toContain("待退款");
  });

  it("CASE 2 / F：部分退款不得寫全額退款", () => {
    const { subject, html } = renderRefundProcessed(build(cardOrder), {
      refundAmount: 500,
      refundedTotal: 500,
      paidAmount: 1000,
      refundStatus: "partial_refunded",
      refundedAtText: "2026/08/24 17:00",
    });
    expect(subject).toContain("部分退款完成");
    expect(html).toContain("部分退款完成");
    expect(html).toContain("退款後實收");
    expect(html).toContain("NT$ 500");
    expect(html).not.toContain("退款已全部完成");
  });

  it("CASE 6：銀行匯款取消信維持人工退款排程文案（手續費由館別設定帶入）", () => {
    const { html } = renderOrderCancelled(build(bankOrder), {
      cancelledAtText: "2026/08/24 16:00",
      paidAmount: 300,
      refundedTotal: 0,
      refundStatus: "pending_manual",
      handlingFee: 30,
    });
    expect(html).toContain("應付訂金");
    expect(html).toContain("匯款手續費");
    expect(html).not.toContain("原信用卡退刷（TapPay）");
  });

  it("CASE 7：ATM 維持人工退款文案，不被信用卡判定誤傷", () => {
    const { html } = renderOrderCancelled(build(atmOrder), {
      cancelledAtText: "2026/08/24 16:00",
      paidAmount: 300,
      refundedTotal: 0,
      refundStatus: "pending_manual",
      handlingFee: 50,
    });
    expect(html).toContain("NT$50 匯款手續費");
    expect(html).not.toContain("原信用卡退刷（TapPay）");
  });

  it("館別設定手續費 0 → 取消信不得出現手續費文案", () => {
    const { html } = renderOrderCancelled(build(atmOrder), {
      cancelledAtText: "2026/08/24 16:00",
      paidAmount: 300,
      refundedTotal: 0,
      refundStatus: "pending_manual",
      handlingFee: 0,
    });
    expect(html).not.toContain("匯款手續費");
  });

  it("信用卡取消信永遠不帶手續費（即使誤傳館別設定）", () => {
    const { html } = renderOrderCancelled(build(cardOrder), {
      cancelledAtText: "2026/08/24 16:00",
      paidAmount: 1000,
      refundedTotal: 0,
      refundStatus: "pending_manual",
      handlingFee: 30,
    });
    expect(html).not.toContain("匯款手續費");
  });

  it("C：信用卡取消信使用 full_prepayment 政策級距（不自算比例）", () => {
    const { html } = renderOrderCancelled(build(cardOrder), {
      cancelledAtText: "2026/08/24 16:00",
      paidAmount: 1000,
      refundedTotal: 0,
      refundStatus: "pending_manual",
    });
    expect(html).toContain("取消政策（預收房價總金額）");
    expect(html).not.toContain("14 日");
  });

  it("退款金額全部來自傳入值，template 不自算", () => {
    const { html } = renderRefundProcessed(build(cardOrder), {
      refundAmount: 777,
      refundedTotal: 777,
      paidAmount: 1000,
      refundStatus: "partial_refunded",
      refundedAtText: "2026/08/24 17:00",
    });
    expect(html).toContain("NT$ 777");
    expect(html).toContain("NT$ 223");
  });
});
