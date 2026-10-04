import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  canEditPaidDiscount,
  isDiscountRefundLocked,
  buildPaidDiscountChanges,
  PAID_DISCOUNT_SOURCE,
} from "@/lib/paidDiscountEdit";

const ACC = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

const base = (over: Record<string, unknown> = {}) => ({
  accommodation_id: ACC,
  payment_status: "paid",
  order_status: "confirmed",
  refund_status: "none",
  refunded_amount: 0,
  refunded_at: null,
  paid_amount: 10000,
  ...over,
});

const check = (level: any, order: any = base(), acc: string | null = ACC) =>
  canEditPaidDiscount({ ordersLevel: level, currentAccommodationId: acc, order });

describe("STEP 1 — 已結清折扣權限（唯一來源 = /admin 同館 orders = editable）", () => {
  it("editable 同館 → ALLOW", () => {
    expect(check("editable").allowed).toBe(true);
  });
  it("readonly / hidden / null / undefined → DENY", () => {
    for (const lv of ["readonly", "hidden", null, undefined]) {
      expect(check(lv as any).allowed).toBe(false);
    }
  });
  it("他館訂單 → DENY", () => {
    expect(check("editable", base({ accommodation_id: OTHER })).allowed).toBe(false);
  });
  it("無館別 context → DENY", () => {
    expect(check("editable", base(), null).allowed).toBe(false);
  });
  it("訂單未載入 → DENY", () => {
    expect(check("editable", null).allowed).toBe(false);
  });
  it("deposit_paid / unpaid 亦依同一權限判定", () => {
    expect(check("editable", base({ payment_status: "deposit_paid" })).allowed).toBe(true);
    expect(check("editable", base({ payment_status: "unpaid", paid_amount: 0 })).allowed).toBe(true);
    expect(check("readonly", base({ payment_status: "unpaid", paid_amount: 0 })).allowed).toBe(false);
  });
});

describe("STEP 1 — 退款／取消保護", () => {
  it("退款中 / 已退款 / 已退金額 / 退款時間 → DENY", () => {
    expect(check("editable", base({ refund_status: "pending_manual" })).allowed).toBe(false);
    expect(check("editable", base({ refund_status: "refunded" })).allowed).toBe(false);
    expect(check("editable", base({ payment_status: "refunded" })).allowed).toBe(false);
    expect(check("editable", base({ payment_status: "partial_refunded" })).allowed).toBe(false);
    expect(check("editable", base({ refunded_amount: 500 })).allowed).toBe(false);
    expect(check("editable", base({ refunded_at: "2026-01-01" })).allowed).toBe(false);
  });
  it("已取消且曾付款 → DENY；已取消但未付款 → ALLOW", () => {
    expect(
      check("editable", base({ order_status: "cancelled" })).allowed,
    ).toBe(false);
    expect(
      check(
        "editable",
        base({ order_status: "cancelled", payment_status: "unpaid", paid_amount: 0 }),
      ).allowed,
    ).toBe(true);
  });
  it("保證金退還不得誤擋", () => {
    expect(
      isDiscountRefundLocked(
        base({ deposit_status: "refunded", deposit_refunded_amount: 5000 }) as any,
      ),
    ).toBe(false);
    expect(
      check("editable", base({ deposit_status: "refunded", deposit_refunded_amount: 5000 })).allowed,
    ).toBe(true);
  });
});

describe("STEP 1 — 變更記錄組裝", () => {
  const before = { discount_amount: 100, discount_code: "ABC", final_price: 900 };
  it("no-op → 空陣列（不得寫入記錄）", () => {
    expect(buildPaidDiscountChanges(before, { ...before })).toEqual([]);
    expect(buildPaidDiscountChanges(before, { ...before, discount_code: " abc " })).toEqual([]);
  });
  it("手動折扣 / 清除折扣 / 折扣碼 皆記錄 before→after", () => {
    const manual = buildPaidDiscountChanges(before, {
      discount_amount: 300,
      discount_code: "ABC",
      final_price: 700,
    });
    expect(manual.map((c) => c.field)).toEqual(["discount_amount", "final_price"]);
    expect(manual[0]).toMatchObject({ before: 100, after: 300 });

    const cleared = buildPaidDiscountChanges(before, {
      discount_amount: 0,
      discount_code: null,
      final_price: 1000,
    });
    expect(cleared.map((c) => c.field)).toEqual([
      "discount_amount",
      "discount_code",
      "final_price",
    ]);
    expect(cleared[1]).toMatchObject({ before: "ABC", after: null });
  });
});

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../", p), "utf8");
const dialog = read("components/orders/OrderPriceEditDialog.tsx");
const orderDetail = read("pages/OrderDetail.tsx");
const accounts = read("pages/Accounts.tsx");
const scope = read("lib/discountScope.ts");

describe("STEP 1 — 原始碼契約", () => {
  it("舊的「修改已結清折扣」名單完全不再被引用", () => {
    for (const src of [dialog, orderDetail, accounts]) {
      expect(src).not.toContain("paid_order_discount_unlock_permissions");
      expect(src).not.toContain("can_unlock_paid_order_discount");
      expect(src).not.toContain("canUnlockPaidOrderDiscount");
      expect(src).not.toContain("canUnlockPaidDiscount");
    }
  });
  it("折扣入口使用單一權限判定與單一來源標記", () => {
    expect(dialog).toContain("useStaffPermissions");
    expect(dialog).toContain("canEditPaidDiscount({");
    expect(dialog).toContain('getLevel("orders")');
    expect(dialog).toContain("PAID_DISCOUNT_SOURCE");
    expect(dialog).toContain("paid_discount_edit");
  });
  it("已結清折扣修改必須填原因", () => {
    expect(dialog).toContain("paidDiscountEdited && !editReason.trim()");
  });
  it("inline 編輯不再提供已付款折扣修改入口，也不改動 order_rooms 流程", () => {
    expect(orderDetail).toContain("const INLINE_PAID_DISCOUNT_EDITABLE = false;");
    expect(orderDetail).not.toContain("supabase.rpc(\"can_unlock_paid_order_discount\"");
  });
  it("多房型／多房價方案不得猜第一筆", () => {
    expect(scope).toContain("ambiguous: true");
    expect(dialog).toContain("getOrderDiscountScope");
    expect(dialog).toContain("scope.ambiguous");
  });
  it("來源字串固定", () => {
    expect(PAID_DISCOUNT_SOURCE).toBe("/admin 修改已結清折扣");
  });
});
