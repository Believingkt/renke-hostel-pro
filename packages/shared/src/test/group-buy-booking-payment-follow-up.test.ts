import { describe, expect, it } from "vitest";

(globalThis as unknown as { Deno?: unknown }).Deno ??= { env: { get: () => undefined } };
const { renderBookingWithBankInfo } = await import(
  "../../../../supabase/functions/_shared/groupBuyEmail.ts"
);

const order: any = {
  orderNumber: "TESTATM1",
  guestName: "測試旅客",
  campaignTitle: "測試活動",
  checkInDate: "2026-10-01",
  checkOutDate: "2026-10-02",
  totalPrice: 10000,
  depositAmount: 3000,
  deadlineText: "2026/09/12 23:59",
  orderUrl: "https://booking.lakeze.com/group-buy/order",
};

const bank = {
  bankName: "合作金庫",
  bankCode: "006",
  branchName: "測試分行",
  accountName: "測試公司",
  accountNumber: "123456789",
};

describe("booking_pending 付款後指引", () => {
  it("ATM 版自動核帳，不含手動匯款回報文案，保留查詢訂單", () => {
    const { html } = renderBookingWithBankInfo(order, null, {
      bankCode: "822",
      vaccNo: "9259626090654682",
      expireText: "2026/09/12 23:59",
      amount: 3000,
    });

    expect(html).toContain("匯款完成後系統會自動比對入帳並更新訂單狀態");
    expect(html).toContain("【訂房確認・已收到訂金】通知信");
    expect(html).toContain(">查詢訂單</a>");
    expect(html).not.toContain("我已完成匯款");
    expect(html).not.toContain("匯款回報");
  });

  it("非 ATM 版信尾維持施工前逐字內容", () => {
    const { html } = renderBookingWithBankInfo(order, bank);
    expect(html).toContain(
      "<p>匯款完成後，請至訂單查詢頁點選「我已完成匯款」，我們會盡快為您核對入帳。</p>",
    );
    expect(html).toContain(
      `<p style="text-align:center"><a class="btn" href="https://booking.lakeze.com/group-buy/order">匯款回報 / 查詢訂單</a></p>`,
    );
  });
});