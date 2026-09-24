import { describe, expect, it } from "vitest";
import {
  canProcessRefund,
  depositState,
  refundState,
  remainingRefundable,
} from "@lakeze/shared/lib/groupBuyPayment";

describe("團購訂金三態（source of truth = orders）", () => {
  it("未付款 → 未付", () => {
    expect(depositState({ paid_amount: 0, deposit_amount: 3000, payment_status: "unpaid" })).toBe("unpaid");
  });
  it("低於應付訂金 → 部分付款", () => {
    expect(depositState({ paid_amount: 1000, deposit_amount: 3000, payment_status: "deposit_paid" })).toBe("partial");
  });
  it("達應付訂金 → 已付", () => {
    expect(depositState({ paid_amount: 3000, deposit_amount: 3000, payment_status: "deposit_paid" })).toBe("paid");
  });
  it("payment_status=paid 一律已付", () => {
    expect(depositState({ paid_amount: 0, deposit_amount: 3000, payment_status: "paid" })).toBe("paid");
  });
});

describe("退款狀態", () => {
  it("未付款取消 → 不需退款", () => {
    expect(refundState({ order_status: "cancelled", paid_amount: 0, refund_status: "none" })).toBe("none");
  });
  it("已付款取消未退 → 待退款", () => {
    expect(refundState({ order_status: "cancelled", paid_amount: 3000, refund_status: "pending" })).toBe("pending");
  });
  it("舊資料（cancelled + none 但仍有已收款）→ 待退款", () => {
    expect(refundState({ order_status: "cancelled", paid_amount: 3000, refund_status: "none" })).toBe("pending");
  });
  it("部分退款", () => {
    expect(
      refundState({ order_status: "cancelled", paid_amount: 3000, refunded_amount: 1000, refund_status: "partial_refunded" }),
    ).toBe("partial");
  });
  it("全額退款", () => {
    expect(
      refundState({ order_status: "cancelled", paid_amount: 3000, refunded_amount: 3000, refund_status: "refunded" }),
    ).toBe("refunded");
  });
});

describe("退款按鈕顯示條件與可退金額", () => {
  const base = { order_status: "cancelled", paid_amount: 3000, refunded_amount: 1000, refund_status: "partial_refunded" };
  it("尚有餘額可退 → 顯示", () => {
    expect(canProcessRefund(base)).toBe(true);
    expect(remainingRefundable(base)).toBe(2000);
  });
  it("已全額退款 → 不顯示", () => {
    expect(canProcessRefund({ ...base, refunded_amount: 3000, refund_status: "refunded" })).toBe(false);
  });
  it("未取消 → 不顯示", () => {
    expect(canProcessRefund({ ...base, order_status: "confirmed" })).toBe(false);
  });
  it("未收款 → 不顯示", () => {
    expect(canProcessRefund({ order_status: "cancelled", paid_amount: 0, refund_status: "none" })).toBe(false);
  });
});
