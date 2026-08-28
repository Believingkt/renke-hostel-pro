import { describe, it, expect } from "vitest";
import { resolvePaymentSummary } from "@/lib/paymentSummary";

const legacy = {
  final_price: 20000, paid_amount: 0, payment_status: "pending_payment",
  notes: "[訂金制] ATM 線上匯款訂金 NT$ 6,000（總額 NT$ 20,000 的 30%），尾款 NT$ 14,000 入住現場付清",
  atm_vacc_no: "9259626080618342", atm_expire_at: "2026-08-24T03:03:19Z",
};

describe("paymentSummary", () => {
  it("legacy notes fallback (PE2E77Z8)", () => {
    const s = resolvePaymentSummary(legacy, new Date("2026-08-24T02:50:00Z").getTime());
    expect(s.bookingDepositAmount).toBe(6000);
    expect(s.bookingDepositPercentage).toBe(30);
    expect(s.accommodationBalance).toBe(14000);
    expect(s.payAmount).toBe(6000);
    expect(s.payTitle).toBe("待匯款訂金");
    expect(s.isLegacyDepositFallback).toBe(true);
  });
  it("snapshot wins over notes", () => {
    const s = resolvePaymentSummary({ ...legacy, booking_deposit_amount: 7000, booking_deposit_percentage: 35 });
    expect(s.bookingDepositAmount).toBe(7000);
    expect(s.bookingDepositPercentage).toBe(35);
    expect(s.accommodationBalance).toBe(13000);
  });
  it("full paid", () => {
    const s = resolvePaymentSummary({ final_price: 20000, paid_amount: 20000, payment_status: "paid" });
    expect(s.payTitle).toBe("已付款");
    expect(s.payAmount).toBe(20000);
    expect(s.accommodationBalance).toBe(0);
  });
  it("no deposit, unpaid", () => {
    const s = resolvePaymentSummary({ final_price: 8000, paid_amount: 0, payment_status: "unpaid" });
    expect(s.payTitle).toBe("待付款");
    expect(s.payAmount).toBe(8000);
    expect(s.pendingBookingDeposit).toBe(0);
  });
  it("expired atm", () => {
    const s = resolvePaymentSummary(legacy, new Date("2026-08-24T04:00:00Z").getTime());
    expect(s.atmExpired).toBe(true);
    expect(s.payTitle).toBe("訂金已逾期未付");
  });
});
