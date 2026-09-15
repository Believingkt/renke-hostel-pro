import { describe, expect, it } from "vitest";
import { buildGroupBuyOrderInsert } from "../../supabase/functions/_shared/groupBuyBooking.ts";

const plan: any = {
  campaign: { accommodation_id: "acc-1", deposit_percentage: 30, slug: "ma", title: "團購", discount_code: null },
  pkg: { package_id: "p1", display_name: "測試方案" },
  roomTypeId: "rt-1",
  roomQuantity: 1,
  input: {
    checkInDate: "2026-11-09",
    checkOutDate: "2026-11-10",
    guestCount: 2,
    adultCount: 2,
    childCount: 0,
    toddlerCount: 0,
    infantCount: 0,
    guestName: "測試",
    guestPhone: "0912345678",
    guestEmail: "t@example.com",
  },
  total: 14000,
  deposit: 4200,
  balance: 9800,
  noteLines: ["【團購】測試", "訂金 4200 元（30%）／尾款 9800 元現場付清"],
};

describe("團購信用卡＝全額付款", () => {
  it("fullPayment 時 deposit_amount 為 0、payment_status 為 paid、備註改為全額付款", () => {
    const row: any = buildGroupBuyOrderInsert(plan, {
      paymentProvider: "tappay",
      paymentMethod: "credit_card_3ds",
      fullPayment: true,
      paid: { amount: 14000 },
    });
    expect(row.deposit_amount).toBe(0);
    expect(row.payment_status).toBe("paid");
    expect(row.paid_amount).toBe(14000);
    expect(row.order_status).toBe("confirmed");
    expect(row.notes).toContain("信用卡全額付款 14000 元（無尾款）");
    expect(row.notes).not.toContain("尾款 9800 元現場付清");
  });

  it("匯款／ATM（未帶 fullPayment）行為完全不變", () => {
    const row: any = buildGroupBuyOrderInsert(plan, {
      paymentProvider: "manual",
      paymentMethod: "bank_transfer",
    });
    expect(row.deposit_amount).toBe(4200);
    expect(row.payment_status).toBe("unpaid");
    expect(row.notes).toContain("訂金 4200 元（30%）／尾款 9800 元現場付清");
  });
});
