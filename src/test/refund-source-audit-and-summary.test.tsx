import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  auditPaymentFields,
  paymentMethodKind,
  refundedEventSourceNote,
} from "../../supabase/functions/_shared/paymentMethodKind.ts";
import { paymentMethodKind as clientKind } from "@/lib/groupBuyPayment";
import { RefundSummaryPanel } from "@/components/groupbuy/RefundSummaryPanel";

const atmOrder = { payment_provider: "manual", payment_method: "atm", deposit_payment_method: "atm" };
const bankOrder = { payment_provider: "manual", payment_method: "bank_transfer" };
const cardOrder = { payment_provider: "tappay", payment_method: "credit_card_3ds" };

describe("audit 原付款方式（CASE 1-3）", () => {
  it("CASE 1 ATM audit", () => {
    const d = auditPaymentFields(atmOrder, false);
    expect(d.payment_method).toBe("atm");
    expect(d.payment_method_kind).toBe("atm");
    expect(d.original_payment_method).toBe("atm");
    expect(d.refund_channel).toBe("manual_bank_refund");
    expect(d.payment_provider).toBe("manual");
  });

  it("CASE 2 Bank audit", () => {
    const d = auditPaymentFields(bankOrder, false);
    expect(d.payment_method).toBe("bank_transfer");
    expect(d.payment_method_kind).toBe("bank");
    expect(d.refund_channel).toBe("manual_bank_refund");
  });

  it("CASE 3 Card audit", () => {
    const d = auditPaymentFields(cardOrder, true);
    expect(d.payment_method).toBe("credit_card_3ds");
    expect(d.payment_method_kind).toBe("card");
    expect(d.refund_channel).toBe("tappay_card_refund");
  });

  it("server 與前台 paymentMethodKind 判定一致", () => {
    for (const o of [atmOrder, bankOrder, cardOrder, {}]) {
      expect(paymentMethodKind(o)).toBe(clientKind(o));
    }
  });
});

describe("refunded event note（CASE 4-5）", () => {
  it("CASE 4 ATM", () => {
    const note = refundedEventSourceNote(atmOrder, false);
    expect(note).toContain("ATM 虛擬帳號");
    expect(note).toContain("人工匯款退款");
    expect(note).not.toContain("銀行匯款－");
  });

  it("CASE 5 Bank", () => {
    const note = refundedEventSourceNote(bankOrder, false);
    expect(note).toBe("銀行匯款－人工匯款退款");
  });

  it("Card 維持原卡退刷文案", () => {
    expect(refundedEventSourceNote(cardOrder, true, "R1")).toContain("原信用卡退刷（TapPay R1）");
  });
});

describe("GroupBuyOrderLookup 退款摘要（CASE 6-10）", () => {
  it("CASE 6 ATM pending_manual", () => {
    render(
      <RefundSummaryPanel
        refund={{
          status: "pending_manual",
          paidAmount: 30,
          policyRefundAmount: 30,
          feeAmount: 0,
          expectedFeeAmount: 10,
          expectedPayoutAmount: 20,
          refundedAmount: 0,
          remainingRefundable: 30,
          paymentMethodLabel: "ATM 虛擬帳號",
          refundChannelLabel: "人工匯款退款",
          isCardOrder: false,
        }}
      />,
    );
    expect(screen.getByText("退款處理中")).toBeInTheDocument();
    expect(screen.getByText("ATM 虛擬帳號")).toBeInTheDocument();
    expect(screen.getByText("-NT$10")).toBeInTheDocument();
    expect(screen.getByText("NT$20")).toBeInTheDocument();
    expect(screen.getByText("待處理")).toBeInTheDocument();
  });

  it("CASE 7 + CASE 10 ATM refunded（FC2B44G9）", () => {
    const { container } = render(
      <RefundSummaryPanel
        refund={{
          status: "refunded",
          paidAmount: 30,
          policyRefundAmount: 30,
          feeAmount: 10,
          expectedFeeAmount: 10,
          expectedPayoutAmount: 20,
          refundedAmount: 20,
          remainingRefundable: 0,
          refundedAt: "2026-08-24T15:48:18Z",
          paymentMethodLabel: "ATM 虛擬帳號",
          refundChannelLabel: "人工匯款退款",
          isCardOrder: false,
        }}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("退款已完成");
    expect(text).toContain("ATM 虛擬帳號");
    expect(text).toContain("已收訂金");
    expect(text).toContain("NT$30");
    expect(text).toContain("-NT$10");
    expect(text).toContain("NT$20");
    expect(text).toContain("NT$0");
    expect(text).toContain("人工匯款退款");
    // CASE 10：不得出現「定金」，也不得誤標為銀行匯款／信用卡
    expect(text).not.toContain("定金");
    expect(text).not.toContain("銀行匯款");
    expect(text).not.toContain("信用卡");
    expect(text).not.toContain("TapPay");
  });

  it("CASE 8 Bank refunded", () => {
    const { container } = render(
      <RefundSummaryPanel
        refund={{
          status: "refunded",
          paidAmount: 100,
          policyRefundAmount: 100,
          feeAmount: 10,
          refundedAmount: 90,
          remainingRefundable: 0,
          paymentMethodLabel: "銀行匯款",
          refundChannelLabel: "人工匯款退款",
          isCardOrder: false,
        }}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("銀行匯款");
    expect(text).not.toContain("ATM 虛擬帳號");
    expect(text).toContain("-NT$10");
  });

  it("CASE 9 Card refunded 不顯示人工退款手續費", () => {
    const { container } = render(
      <RefundSummaryPanel
        refund={{
          status: "refunded",
          paidAmount: 1000,
          policyRefundAmount: 1000,
          feeAmount: 0,
          expectedFeeAmount: 30,
          refundedAmount: 1000,
          remainingRefundable: 0,
          paymentMethodLabel: "信用卡",
          refundChannelLabel: "原信用卡退刷（TapPay）",
          isCardOrder: true,
        }}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("信用卡");
    expect(text).toContain("原信用卡退刷（TapPay）");
    expect(text).not.toContain("人工退款手續費");
    expect(text).not.toContain("定金");
  });
});
