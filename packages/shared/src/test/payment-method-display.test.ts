import { describe, it, expect } from "vitest";
import { paymentMethodLabel, refundChannelLabel } from "@lakeze/shared/lib/groupBuyPayment";

describe("原付款方式／退款方式顯示分流", () => {
  it("CASE A: manual + atm → ATM 虛擬帳號", () => {
    expect(paymentMethodLabel({ payment_provider: "manual", payment_method: "atm" })).toBe("ATM 虛擬帳號");
  });
  it("CASE B: manual + bank → 銀行匯款", () => {
    expect(paymentMethodLabel({ payment_provider: "manual", payment_method: "bank" })).toBe("銀行匯款");
    expect(paymentMethodLabel({ payment_provider: "manual", payment_method: "bank_transfer" })).toBe("銀行匯款");
  });
  it("CASE C: tappay + credit_card_3ds → 信用卡", () => {
    expect(paymentMethodLabel({ payment_provider: "tappay", payment_method: "credit_card_3ds" })).toBe("信用卡");
  });
  it("CASE D: ATM 已退款仍顯示 ATM 虛擬帳號", () => {
    expect(
      paymentMethodLabel({
        payment_provider: "manual",
        payment_method: "atm",
        refund_status: "refunded",
        refunded_amount: 20,
        refund_fee_amount: 10,
        paid_amount: 30,
      }),
    ).toBe("ATM 虛擬帳號");
  });
  it("CASE E: ATM → 人工匯款退款", () => {
    const o = { payment_provider: "manual", payment_method: "atm" };
    expect(paymentMethodLabel(o)).toBe("ATM 虛擬帳號");
    expect(refundChannelLabel(o)).toBe("人工匯款退款");
  });
  it("CASE F: Bank → 人工匯款退款", () => {
    const o = { payment_provider: "manual", payment_method: "bank_transfer" };
    expect(paymentMethodLabel(o)).toBe("銀行匯款");
    expect(refundChannelLabel(o)).toBe("人工匯款退款");
  });
  it("CASE G: 信用卡 → 原信用卡退刷（TapPay）", () => {
    const o = { payment_provider: "tappay", payment_method: "credit_card_3ds" };
    expect(paymentMethodLabel(o)).toBe("信用卡");
    expect(refundChannelLabel(o)).toBe("原信用卡退刷（TapPay）");
  });
  it("fallback: 只有 provider 時維持既有語意", () => {
    expect(paymentMethodLabel({ payment_provider: "manual" })).toBe("銀行匯款");
    expect(paymentMethodLabel({ payment_provider: "tappay" })).toBe("信用卡");
  });
});
