/**
 * 團購旅客自助取消｜分流與退款金額規則
 * 純函式驗證，不呼叫 TapPay、不寫入 DB。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyGroupBuySelfCancel,
  resolveSelfCancelRefundAmount,
} from "../../supabase/functions/_shared/groupBuySelfCancel";

const lookupSrc = readFileSync(
  resolve(process.cwd(), "supabase/functions/group-buy-order-lookup/index.ts"),
  "utf-8",
);

describe("自助取消分流", () => {
  it("ATM 未付款 → 直接取消", () => {
    const r = classifyGroupBuySelfCancel({
      payment_method: "atm",
      payment_provider: "manual",
      paid_amount: 0,
    });
    expect(r.mode).toBe("direct_cancel");
  });

  it("銀行匯款未收款 → 直接取消", () => {
    expect(classifyGroupBuySelfCancel({ payment_method: "bank_transfer", paid_amount: null }).mode)
      .toBe("direct_cancel");
  });

  it("信用卡已收款 → 自動原卡退刷", () => {
    const r = classifyGroupBuySelfCancel({
      payment_method: "credit_card",
      payment_provider: "tappay",
      paid_amount: 6000,
    });
    expect(r.mode).toBe("card_auto_refund");
    expect(r.refundable).toBe(6000);
  });

  it("信用卡已全額退款 → 不再自動退款", () => {
    expect(
      classifyGroupBuySelfCancel({
        payment_method: "credit_card",
        payment_provider: "tappay",
        paid_amount: 6000,
        refunded_amount: 6000,
      }).mode,
    ).toBe("manual_review");
  });

  it("ATM 已收款 → 維持人工審核（銀行退匯無法自動化）", () => {
    expect(
      classifyGroupBuySelfCancel({ payment_method: "atm", payment_provider: "manual", paid_amount: 3000 }).mode,
    ).toBe("manual_review");
  });
});

describe("退款金額依政策級距，且不得超過可退餘額", () => {
  it("政策金額小於可退餘額 → 取政策金額", () => {
    expect(resolveSelfCancelRefundAmount({ refundable: 6000, policyRefundAmount: 4200 }))
      .toEqual({ manualReview: false, refundAmount: 4200 });
  });

  it("政策金額大於可退餘額 → 取可退餘額", () => {
    expect(resolveSelfCancelRefundAmount({ refundable: 1000, policyRefundAmount: 4200 }).refundAmount)
      .toBe(1000);
  });

  it("政策無法自動判定 → 降級人工審核，絕不自動退款", () => {
    expect(
      resolveSelfCancelRefundAmount({
        refundable: 6000,
        policyRefundAmount: 6000,
        requiresManualReview: true,
      }),
    ).toEqual({ manualReview: true, refundAmount: 0 });
  });
});

describe("server 流程保護", () => {
  it("信用卡採 refund-first：退款成功後才 update orders", () => {
    const idx = lookupSrc.indexOf("if (canAutoHandle) {");
    const tail = lookupSrc.slice(idx);
    const refundIdx = tail.indexOf("refundPayment(");
    const updateIdx = tail.indexOf('.from("orders")');
    expect(refundIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(refundIdx);
  });

  it("取消寫入帶併發保護（付款狀態變動即中止）", () => {
    expect(lookupSrc).toContain('.eq("payment_status", order.payment_status)');
    expect(lookupSrc).toContain('.neq("order_status", "cancelled")');
  });

  it("退款金額一律 server 依政策計算，不接受前端傳入", () => {
    expect(lookupSrc).toContain("resolveSelfCancelRefundAmount({");
    expect(lookupSrc).not.toContain("body.refundAmount");
  });

  it("自助取消不歸零 paid_amount", () => {
    expect(lookupSrc).not.toContain("paid_amount: 0");
  });
});
