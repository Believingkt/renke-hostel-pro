import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  canShowPaidDiscountEntry,
  isSettledPaymentStatus,
  SETTLED_PAYMENT_STATUSES,
} from "@/lib/paidDiscountEdit";

const ACC = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

const order = (over: Record<string, unknown> = {}) => ({
  accommodation_id: ACC,
  payment_status: "paid",
  order_status: "confirmed",
  refund_status: "none",
  refunded_amount: 0,
  refunded_at: null,
  paid_amount: 10000,
  ...over,
});

const show = (level: any, o: any = order(), acc: string | null = ACC) =>
  canShowPaidDiscountEntry({ ordersLevel: level, currentAccommodationId: acc, order: o });

describe("修改已結清折扣入口 — 顯示條件", () => {
  it("已結清狀態僅 paid / fully_paid", () => {
    expect([...SETTLED_PAYMENT_STATUSES]).toEqual(["paid", "fully_paid"]);
    expect(isSettledPaymentStatus("paid")).toBe(true);
    expect(isSettledPaymentStatus("fully_paid")).toBe(true);
    for (const s of ["unpaid", "deposit_paid", "pending_payment", "partial_paid", "refunded", "", null]) {
      expect(isSettledPaymentStatus(s as any)).toBe(false);
    }
  });

  it("paid + editable + 同館 → 顯示", () => {
    expect(show("editable")).toBe(true);
  });

  it("fully_paid 相容顯示", () => {
    expect(show("editable", order({ payment_status: "fully_paid" }))).toBe(true);
  });

  it("unpaid / deposit_paid / pending_payment → 不顯示", () => {
    for (const s of ["unpaid", "deposit_paid", "pending_payment", "partial_paid"]) {
      expect(show("editable", order({ payment_status: s, paid_amount: 0 }))).toBe(false);
    }
  });

  it("refunded / partial_refunded → 不顯示", () => {
    expect(show("editable", order({ payment_status: "refunded" }))).toBe(false);
    expect(show("editable", order({ payment_status: "partial_refunded" }))).toBe(false);
  });

  it("退款中／已取消但仍為 paid → 仍顯示（由對話框做高風險二次確認）", () => {
    expect(show("editable", order({ refund_status: "pending_manual" }))).toBe(true);
    expect(show("editable", order({ order_status: "cancelled" }))).toBe(true);
  });

  it("readonly / hidden / null → 不顯示", () => {
    for (const lv of ["readonly", "hidden", null, undefined]) {
      expect(show(lv as any)).toBe(false);
    }
  });

  it("跨館 / 無館別 context / 訂單未載入 → 不顯示", () => {
    expect(show("editable", order({ accommodation_id: OTHER }))).toBe(false);
    expect(show("editable", order(), null)).toBe(false);
    expect(show("editable", null)).toBe(false);
  });

  it("不得以 paid_amount 或其他條件替代", () => {
    expect(show("editable", order({ payment_status: "unpaid", paid_amount: 999999 }))).toBe(false);
    expect(show("editable", order({ payment_status: "paid", paid_amount: 0 }))).toBe(true);
  });
});

describe("原始碼契約", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  const detail = read("src/pages/OrderDetail.tsx");
  const lib = read("src/lib/paidDiscountEdit.ts");

  it("OrderDetail 折扣按鈕由 canShowPaidDiscountEntry 控制", () => {
    expect(detail).toContain("canShowPaidDiscountEntry({");
    expect(detail).toContain("{showPaidDiscountEntry && (");
  });

  it("不得使用 paid_amount 比較或舊特殊權限作為顯示條件", () => {
    expect(lib).not.toContain("paid_order_discount_unlock_permissions");
    expect(lib).not.toContain("can_unlock_paid_order_discount");
    const fn = lib.slice(lib.indexOf("export function canShowPaidDiscountEntry"));
    const body = fn.slice(0, fn.indexOf("\n}\n") + 2);
    expect(body).not.toContain("paid_amount");
    expect(body).not.toContain("checked_in");
  });

  it("未付款／訂金訂單的一般編輯流程不變", () => {
    expect(detail).toContain("canUsePaidAmountDialogs");
    expect(detail).toContain("isPaidAddonFlowOrder(order as any)");
  });
});
