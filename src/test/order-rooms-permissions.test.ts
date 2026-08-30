import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../", p), "utf8");

const createOrder = read("components/orders/CreateOrderDialog.tsx");
const createHold = read("components/orders/CreateHoldOrderDialog.tsx");
const orderDetail = read("pages/OrderDetail.tsx");
const calendar = read("components/BookingCalendarGrid.tsx");
const orders = read("pages/Orders.tsx");

describe("Phase 3C-3B：order_rooms 寫入權限對齊（原始碼契約）", () => {
  it("四個檔案都使用既有 useStaffPermissions，未自建第二套權限系統", () => {
    for (const src of [createOrder, createHold, orderDetail, calendar]) {
      expect(src).toContain("useStaffPermissions");
      expect(src).toContain('canEdit');
      expect(src).not.toMatch(/from "@\/hooks\/use-orders-permissions"/);
    }
  });

  it("CreateOrderDialog handleSave 在任何副作用前先做權限守門", () => {
    const idx = createOrder.indexOf("const handleSave = async () => {");
    const head = createOrder.slice(idx, idx + 400);
    expect(head).toContain("if (!canEditOrders)");
    // guard 必須在第一個 supabase 寫入之前
    expect(idx).toBeLessThan(createOrder.indexOf('.from("orders")\n        .insert'));
  });

  it("CreateHoldOrderDialog handleSave 具權限守門", () => {
    const idx = createHold.indexOf("const handleSave = async () => {");
    expect(createHold.slice(idx, idx + 400)).toContain("if (!canEditOrders)");
  });

  it("CreateHoldOrderDialog 房間寫入失敗改為單一 partial-success 警告，不再純成功", () => {
    expect(createHold).toContain("roomsWriteFailed = true");
    expect(createHold).toContain("保留單已建立，但房間資料寫入失敗");
    expect(createHold).toContain("if (roomsWriteFailed) {");
    // 成功 toast 僅存在於 else 分支
    expect(createHold).toContain("保留單建立成功");
  });

  it("OrderDetail 使用 admin-inclusive 的 canManageOrders 作為 write gate", () => {
    expect(orderDetail).toContain('const canManageOrders = canEditModule("orders");');
    const start = orderDetail.indexOf("const startEditing = () => {");
    expect(orderDetail.slice(start, start + 400)).toContain("if (!canManageOrders)");
    const save = orderDetail.indexOf("const handleSaveEdit = async () => {");
    expect(orderDetail.slice(save, save + 400)).toContain("if (!canManageOrders)");
  });

  it("OrderDetail 編輯入口 UI 受 canManageOrders 控制", () => {
    expect(orderDetail).toContain("{canManageOrders && (");
    expect(orderDetail).toContain(") : canManageOrders ? (");
    expect(orderDetail).toContain("{canManageOrders && order.payment_status !== 'paid'");
  });

  it("OrderDetail remove-all 刪除後驗證殘留列，且不要求刪除筆數 > 0", () => {
    expect(orderDetail).toContain("remainingAfterRemoveAll");
    expect(orderDetail).toContain("無法刪除舊的房間記錄，請確認您有足夠的權限");
    expect(orderDetail).not.toMatch(/deletedRows\.length === 0[\s\S]{0,80}throw/);
  });

  it("BookingCalendarGrid 指派 handler 有守門，UI 對 readonly 停用", () => {
    const idx = calendar.indexOf("const assignEntryToUnit = async");
    expect(calendar.slice(idx, idx + 400)).toContain("if (!canEditOrders)");
    expect(calendar).toContain("disabled={!canEditOrders}");
  });

  it("Orders.tsx 未被本 Phase 修改（仍沿用既有 gate）", () => {
    expect(orders).toContain("useStaffPermissions");
    expect(orders).not.toContain("canManageOrders");
  });
});
