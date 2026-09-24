import { describe, expect, it } from "vitest";
import {
  eventSignature,
  isNoOpCharge,
  isStaleRefund,
  signatureFromRaw,
} from "../../../../supabase/functions/_shared/tappayEventDedupe";
import { computeRefundAmounts } from "../../../../supabase/functions/_shared/refundIdempotency";

const chargePayload = { status: 0, amount: 10000, refunded_amount: undefined };

describe("Q3-B 事件指紋", () => {
  it("CASE 1/2/3：相同 charge 通知指紋一致（可辨識重送）", () => {
    const sig = eventSignature({ eventType: "charge", status: 0, amount: 10000, refundedTotal: null });
    expect(signatureFromRaw({ status: 0, amount: 10000 }, { eventType: "charge", status: 0, amount: 10000 }))
      .toBe(sig);
  });

  it("CASE 5：相同退款通知指紋一致", () => {
    const a = eventSignature({ eventType: "refund", status: 0, amount: 2000, refundedTotal: 2000 });
    const b = signatureFromRaw({ status: 0, amount: 2000, refunded_amount: 2000 }, {
      eventType: "refund", status: 0, amount: 2000,
    });
    expect(b).toBe(a);
  });

  it("CASE 6：第二次合法退款（累計 2000 → 3000）指紋不同，不會被誤擋", () => {
    const first = eventSignature({ eventType: "refund", status: 0, amount: 2000, refundedTotal: 2000 });
    const second = eventSignature({ eventType: "refund", status: 0, amount: 1000, refundedTotal: 3000 });
    expect(second).not.toBe(first);
  });

  it("失敗事件與成功事件指紋不同（retry 不會被誤判為已完成）", () => {
    expect(eventSignature({ eventType: "charge", status: 0, amount: 10000, refundedTotal: null }))
      .not.toBe(eventSignature({ eventType: "charge", status: 3, amount: 10000, refundedTotal: null }));
  });
});

describe("Q3-B 副作用 no-op 判定", () => {
  it("CASE 4：首次退款 2000 不是 no-op", () => {
    const r = computeRefundAmounts({
      currentPaid: 10000, currentRefundedTotal: 0, incomingRefundedTotal: 2000, fallbackAmount: 2000,
    });
    expect(r.delta).toBe(2000);
    expect(isStaleRefund(0, r.delta)).toBe(false);
  });

  it("CASE 5/7：相同累計退款重送 → delta 0 → no-op", () => {
    const r = computeRefundAmounts({
      currentPaid: 8000, currentRefundedTotal: 2000, incomingRefundedTotal: 2000, fallbackAmount: 2000,
    });
    expect(r.delta).toBe(0);
    expect(r.newPaid).toBe(8000);
    expect(isStaleRefund(2000, r.delta)).toBe(true);
  });

  it("CASE 6：累計 2000 → 3000 仍會處理（非 no-op）", () => {
    const r = computeRefundAmounts({
      currentPaid: 8000, currentRefundedTotal: 2000, incomingRefundedTotal: 3000, fallbackAmount: 1000,
    });
    expect(r.delta).toBe(1000);
    expect(r.newPaid).toBe(7000);
    expect(r.newRefundedTotal).toBe(3000);
    expect(isStaleRefund(2000, r.delta)).toBe(false);
  });

  it("CASE 8：先 3000 後到舊的 2000 → 不倒退、判為 no-op", () => {
    const r = computeRefundAmounts({
      currentPaid: 7000, currentRefundedTotal: 3000, incomingRefundedTotal: 2000, fallbackAmount: 2000,
    });
    expect(r.newRefundedTotal).toBe(3000);
    expect(r.newPaid).toBe(7000);
    expect(isStaleRefund(3000, r.delta)).toBe(true);
  });

  it("CASE 1：首次扣款不是 no-op", () => {
    expect(isNoOpCharge({
      currentPaid: 0, newPaid: 10000,
      currentPaymentStatus: "unpaid", newPaymentStatus: "paid",
      currentRoomChargeStatus: "pending", currentRoomChargeRecTradeId: null, incomingRecTradeId: "T1",
    })).toBe(false);
  });

  it("CASE 2/3/10：相同扣款重送 → no-op", () => {
    expect(isNoOpCharge({
      currentPaid: 10000, newPaid: 10000,
      currentPaymentStatus: "paid", newPaymentStatus: "paid",
      currentRoomChargeStatus: "charged", currentRoomChargeRecTradeId: "T1", incomingRecTradeId: "T1",
    })).toBe(true);
  });

  it("不同交易的第二次扣款不被誤判", () => {
    expect(isNoOpCharge({
      currentPaid: 10000, newPaid: 10000,
      currentPaymentStatus: "paid", newPaymentStatus: "paid",
      currentRoomChargeStatus: "charged", currentRoomChargeRecTradeId: "T1", incomingRecTradeId: "T2",
    })).toBe(false);
  });

  it("部分付款 → 全額付款狀態變化不被誤判為 no-op", () => {
    expect(isNoOpCharge({
      currentPaid: 5000, newPaid: 10000,
      currentPaymentStatus: "deposit_paid", newPaymentStatus: "paid",
      currentRoomChargeStatus: null, currentRoomChargeRecTradeId: null, incomingRecTradeId: "T1",
    })).toBe(false);
  });
});

it("payload 形狀 sanity", () => {
  expect(chargePayload.status).toBe(0);
});
