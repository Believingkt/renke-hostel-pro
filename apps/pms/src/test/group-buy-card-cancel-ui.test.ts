/**
 * Phase F3-C3｜團購信用卡取消／退款分流回歸測試
 *
 * 純靜態／純函式驗證，絕不呼叫 TapPay 或寫入 DB。
 * 1. 前端顯示 helper 必須與 server isCardPaidOrder() 規則一致
 * 2. server 端必須阻擋信用卡走人工銀行退款
 * 3. 取消流程對信用卡採 refund-first（TapPay 成功後才 update orders）
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isCardPaidOrderDisplay, isTappayCardOrder } from "@/lib/cardPaymentDisplay";

const serverSrc = readFileSync(
  resolve(process.cwd(), "supabase/functions/group-buy-cancel-refund/index.ts"),
  "utf-8",
);
const sharedSrc = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/orderRefund.ts"),
  "utf-8",
);
const adminSrc = readFileSync(resolve(process.cwd(), "src/pages/AdminGroupBuy.tsx"), "utf-8");

describe("前端 display helper 與 server 規則一致", () => {
  const cases: Array<[string, any, boolean]> = [
    ["純信用卡", { payment_method: "credit_card", payment_provider: "tappay" }, true],
    ["3DS 信用卡", { payment_method: "credit_card_3ds", payment_provider: "tappay" }, true],
    ["ATM", { payment_method: "atm", payment_provider: "manual" }, false],
    ["銀行匯款", { payment_method: "bank_transfer", payment_provider: "manual" }, false],
    ["僅有 rec_trade_id", { room_charge_rec_trade_id: "D2026x", payment_provider: "tappay" }, true],
    ["ATM 但誤帶 rec_trade_id", { payment_method: "atm", room_charge_rec_trade_id: "D1" }, false],
    ["空物件", {}, false],
  ];

  it.each(cases)("%s", (_label, order, expected) => {
    expect(isCardPaidOrderDisplay(order)).toBe(expected);
  });

  it("isTappayCardOrder 需同時滿足 provider=tappay", () => {
    expect(isTappayCardOrder({ payment_method: "credit_card", payment_provider: "manual" })).toBe(false);
    expect(isTappayCardOrder({ payment_method: "credit_card", payment_provider: "tappay" })).toBe(true);
    expect(isTappayCardOrder(null)).toBe(false);
  });

  it("server 端 isCardPaidOrder 仍為唯一 Source of Truth", () => {
    expect(sharedSrc).toContain("export function isCardPaidOrder");
    expect(serverSrc).toContain("isCardPaidOrder(order as any)");
  });
});

describe("server：信用卡不得走人工銀行退款", () => {
  it("cancel mode 對信用卡只允許 card_refund / no_refund", () => {
    expect(serverSrc).toContain('? ["card_refund", "no_refund"]');
    expect(serverSrc).toContain('["mark_refunded", "pending_refund", "no_refund"]');
  });

  it("refund-first：TapPay 失敗即回傳錯誤，不更新 orders", () => {
    const cancelIdx = serverSrc.indexOf("// ---------------------------------------------------------------- cancel");
    const tail = serverSrc.slice(cancelIdx);
    const refundIdx = tail.indexOf("adapter.refundPayment");
    const updateIdx = tail.indexOf('.from("orders")');
    expect(refundIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(refundIdx);
    expect(tail).toContain('error: settle.message ?? settle.error ?? "退款處理失敗"');
  });

  it("退款成功後同步 payment_status，且不歸零 paid_amount", () => {
    expect(serverSrc).toContain('? "refunded"');
    expect(serverSrc).toContain(': "partial_refunded"');
    expect(serverSrc).not.toContain("paid_amount: 0");
  });

  it("quote 附帶 TapPay 唯讀對帳資訊，且未呼叫 Refund API", () => {
    expect(serverSrc).toContain("queryTapPayRecord");
    expect(serverSrc).toContain("needsReconciliation");
  });
});

describe("Admin UI：信用卡分流", () => {
  it("使用 shared display helper 判定", () => {
    expect(adminSrc).toContain('from "@/lib/cardPaymentDisplay"');
    expect(adminSrc).toContain("isTappayCardOrder(cancelTarget)");
  });

  it("信用卡不顯示銀行人工退款選項，改為原卡退刷", () => {
    expect(adminSrc).toContain("退款方式：原信用卡退刷（TapPay）");
    expect(adminSrc).toContain("取消訂單並退刷");
  });

  it("提供同步 TapPay 退款狀態按鈕", () => {
    expect(adminSrc).toContain("tappay-sync-refund");
    expect(adminSrc).toContain("同步 TapPay 退款狀態");
  });

  it("orders 查詢需帶付款方式欄位供 UI 判定", () => {
    expect(adminSrc).toContain("room_charge_rec_trade_id");
    expect(adminSrc).toContain("balance_payment_method");
  });
});
