/**
 * Phase F3-C4｜ATM 已付款訂單通用取消入口防護回歸測試
 *
 * 純靜態／純函式驗證，不寫入 DB。
 * 1. isAtmPaidBlocked：付款三欄任一為 atm 且 paid_amount > 0 且 refund_status ≠ refunded
 * 2. isCancelBlockedOrder：ATM 已付款訂單會被擋下，0 元、已退款、現金、信用卡規則不變
 * 3. buildCancelBlockHint：ATM 分支導引到 CancelOrderDialog
 */
import { describe, expect, it } from "vitest";
import {
  isCancelBlockedOrder,
  buildCancelBlockHint,
  type CancelGuardOrderShape,
} from "@/lib/cancelEntryGuard";

describe("ATM 已付款通用取消入口防護", () => {
  it("三個付款方式欄位任一為 atm 即視為 ATM 訂單", () => {
    const base: CancelGuardOrderShape = {
      paid_amount: 1000,
      refund_status: "none",
    };
    expect(isCancelBlockedOrder({ ...base, balance_payment_method: "atm" })).toBe(true);
    expect(isCancelBlockedOrder({ ...base, payment_method: "ATM" })).toBe(true);
    expect(isCancelBlockedOrder({ ...base, deposit_payment_method: "atm_transfer" })).toBe(true);
  });

  it("ATM 但已退款完成 → 不擋", () => {
    expect(
      isCancelBlockedOrder({
        payment_method: "atm",
        paid_amount: 1000,
        refund_status: "refunded",
      }),
    ).toBe(false);
  });

  it("ATM 但未收款（paid_amount <= 0）→ 不擋", () => {
    expect(
      isCancelBlockedOrder({
        payment_method: "atm",
        paid_amount: 0,
        refund_status: "none",
      }),
    ).toBe(false);
    expect(
      isCancelBlockedOrder({
        payment_method: "atm",
        paid_amount: null,
        refund_status: "none",
      }),
    ).toBe(false);
  });

  it("ATM 已收款且 pending_manual 仍會被擋", () => {
    expect(
      isCancelBlockedOrder({
        payment_method: "atm",
        paid_amount: 1000,
        refund_status: "pending_manual",
      }),
    ).toBe(true);
  });

  it("已為 cancelled 狀態時不再擋", () => {
    expect(
      isCancelBlockedOrder({
        order_status: "cancelled",
        payment_method: "atm",
        paid_amount: 1000,
        refund_status: "none",
      }),
    ).toBe(false);
  });

  it("現金／轉帳已收款不會誤擋", () => {
    expect(
      isCancelBlockedOrder({
        payment_method: "cash",
        paid_amount: 1000,
        refund_status: "none",
      }),
    ).toBe(false);
    expect(
      isCancelBlockedOrder({
        payment_method: "bank_transfer",
        paid_amount: 1000,
        refund_status: "none",
      }),
    ).toBe(false);
  });

  it("團購與信用卡優先於 ATM 分支提示", () => {
    expect(
      buildCancelBlockHint({ order_source: "group_buy", payment_method: "atm", paid_amount: 1000, refund_status: "none" }),
    ).toContain("團購");
    expect(
      buildCancelBlockHint({ payment_method: "credit_card", paid_amount: 1000, refund_status: "none" }),
    ).toContain("信用卡");
  });

  it("ATM 分支提示導向取消訂單對話框", () => {
    expect(
      buildCancelBlockHint({
        payment_method: "atm",
        paid_amount: 1000,
        refund_status: "none",
      }),
    ).toContain("ATM 已收款");
  });

  it("空物件與 null 不會擋", () => {
    expect(isCancelBlockedOrder(null)).toBe(false);
    expect(isCancelBlockedOrder({})).toBe(false);
  });
});
