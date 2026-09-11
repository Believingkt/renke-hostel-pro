// 取消信「退款說明」：refund_status='none' 時需同時參考政策應退金額
import { describe, expect, it } from "vitest";

// edge function 模組載入時會讀 Deno.env（寄信設定），測試環境提供最小 shim
(globalThis as unknown as { Deno?: unknown }).Deno ??= { env: { get: () => undefined } };
const { renderOrderCancelled } = await import(
  "../../supabase/functions/_shared/groupBuyEmail.ts"
);

const atmOrder: any = {
  orderNumber: "TEST0001",
  guestName: "測試旅客",
  campaignTitle: "測試活動",
  checkIn: "2026-09-24",
  checkOut: "2026-09-25",
  totalAmount: 18525,
  depositAmount: 5558,
  isCardOrder: false,
  paymentMethodText: "ATM 虛擬帳號轉帳",
  refundChannelText: "人工匯款退款",
};

const baseInfo = {
  cancelledAtText: "2026/09/10 18:29",
  paidAmount: 5558,
  refundedTotal: 0,
  refundFeeTotal: 0,
  handlingFee: 30,
  refundStatus: "none",
  reason: null,
};

describe("取消信退款說明 × 取消政策", () => {
  it("none + 政策應退 > 0 → 顯示退款處理中與金額，不得說不退款", () => {
    const { html } = renderOrderCancelled(atmOrder, {
      ...baseInfo,
      policyRefundAmount: 5558,
      policyRefundPercent: 100,
      policyRequiresManualReview: false,
    } as any);
    expect(html).toContain("退款作業處理中");
    expect(html).toContain("政策應退金額");
    expect(html).toContain("100%");
    expect(html).not.toContain("依取消條件不進行退款");
  });

  it("none + 政策應退 0 元 → 維持原本「不進行退款」文案", () => {
    const { html } = renderOrderCancelled(atmOrder, {
      ...baseInfo,
      policyRefundAmount: 0,
      policyRefundPercent: 0,
      policyRequiresManualReview: false,
    } as any);
    expect(html).toContain("此訂單依取消條件不進行退款");
    expect(html).not.toContain("退款作業處理中");
  });

  it("未傳新欄位 → 輸出與施工前逐字相同（向後相容）", () => {
    const { html } = renderOrderCancelled(atmOrder, { ...baseInfo } as any);
    expect(html).toContain("此訂單依取消條件不進行退款，如有疑問請與我們聯繫。");
    expect(html).not.toContain("退款作業處理中");
  });

  it("信用卡版：none + 政策應退 > 0 → 顯示原卡退刷處理中", () => {
    const { html } = renderOrderCancelled({ ...atmOrder, isCardOrder: true }, {
      ...baseInfo,
      handlingFee: 0,
      policyRefundAmount: 5558,
      policyRefundPercent: 100,
    } as any);
    expect(html).toContain("原信用卡退刷處理中");
    expect(html).not.toContain("依取消政策不進行退款");
  });
});
