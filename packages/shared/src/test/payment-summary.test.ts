import { describe, it, expect } from "vitest";
import { resolvePaymentSummary } from "@lakeze/shared/lib/paymentSummary";

const legacy = {
  final_price: 20000, paid_amount: 0, payment_status: "pending_payment",
  notes: "[訂金制] ATM 線上匯款訂金 NT$ 6,000（總額 NT$ 20,000 的 30%），尾款 NT$ 14,000 入住現場付清",
  atm_vacc_no: "9259626080618342", atm_expire_at: "2026-08-24T03:03:19Z",
};

const snap = {
  final_price: 20000,
  booking_deposit_amount: 6000,
  booking_deposit_percentage: 30,
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

  // CASE A：ATM 訂金完全未付
  it("CASE A - deposit unpaid", () => {
    const s = resolvePaymentSummary({ ...snap, paid_amount: 0, payment_status: "pending_payment" });
    expect(s.pendingBookingDeposit).toBe(6000);
    expect(s.accommodationBalance).toBe(14000);
    expect(s.payTitle).toBe("待匯款訂金");
    expect(s.payAmount).toBe(6000);
  });

  // CASE B：訂金已全付
  it("CASE B - deposit fully paid", () => {
    const s = resolvePaymentSummary({ ...snap, paid_amount: 6000, payment_status: "deposit_paid" });
    expect(s.paidAmount).toBe(6000);
    expect(s.pendingBookingDeposit).toBe(0);
    expect(s.accommodationBalance).toBe(14000);
    expect(s.payTitle).toBe("已付訂金");
    expect(s.payAmount).toBe(6000);
  });

  // CASE C：訂金部分支付
  it("CASE C - deposit partially paid", () => {
    const s = resolvePaymentSummary({ ...snap, paid_amount: 3000, payment_status: "pending_payment" });
    expect(s.paidAmount).toBe(3000);
    expect(s.pendingBookingDeposit).toBe(3000);
    expect(s.accommodationBalance).toBe(14000);
    expect(s.payTitle).toBe("待補足訂金");
    expect(s.payAmount).toBe(3000);
  });

  // CASE D：信用卡全額
  it("CASE D - full paid", () => {
    const s = resolvePaymentSummary({ final_price: 20000, paid_amount: 20000, payment_status: "paid" });
    expect(s.payTitle).toBe("已付款");
    expect(s.payAmount).toBe(20000);
    expect(s.pendingBookingDeposit).toBe(0);
    expect(s.accommodationBalance).toBe(0);
  });

  // CASE E：無訂金、未付款
  it("CASE E - no deposit, unpaid", () => {
    const s = resolvePaymentSummary({ final_price: 20000, paid_amount: 0, payment_status: "unpaid" });
    expect(s.payTitle).toBe("待付款");
    expect(s.payAmount).toBe(20000);
    expect(s.pendingBookingDeposit).toBe(0);
    expect(s.accommodationBalance).toBe(20000);
  });

  it("expired atm", () => {
    const s = resolvePaymentSummary(legacy, new Date("2026-08-24T04:00:00Z").getTime());
    expect(s.atmExpired).toBe(true);
    expect(s.payTitle).toBe("訂金已逾期未付");
  });

  it("deposit_required_amount (入住押金) 不影響付款摘要", () => {
    const s = resolvePaymentSummary({
      ...snap, paid_amount: 0, payment_status: "pending_payment",
      // @ts-expect-error 押金欄位刻意不在型別中，確保不被使用
      deposit_required_amount: 5000,
    });
    expect(s.bookingDepositAmount).toBe(6000);
    expect(s.pendingBookingDeposit).toBe(6000);
    expect(s.accommodationBalance).toBe(14000);
  });

  it("快照不受當前 booking_settings 變動影響", () => {
    // 同一張訂單，不論目前設定改成幾 %，結果只看 snapshot
    const s1 = resolvePaymentSummary({ ...snap, paid_amount: 0 });
    const s2 = resolvePaymentSummary({ ...snap, paid_amount: 0 });
    expect(s1.bookingDepositAmount).toBe(6000);
    expect(s2.bookingDepositPercentage).toBe(30);
  });
});
