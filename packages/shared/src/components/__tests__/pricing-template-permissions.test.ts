import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../PricingTemplateManager.tsx"),
  "utf8",
);
const pricingSrc = fs.readFileSync(
  path.resolve(__dirname, "../../pages/Pricing.tsx"),
  "utf8",
);

describe("PricingTemplateManager 權限歸屬 = room_price", () => {
  it("使用既有 useStaffPermissions，權限鍵為 room_price 而非 pricing", () => {
    expect(src).toContain("useStaffPermissions");
    expect(src).toContain("canView('room_price')");
    expect(src).toContain("canEdit('room_price')");
    expect(src).not.toContain("canEdit('pricing')");
    expect(src).not.toContain("canView('pricing')");
  });

  it("room_price hidden 時不 render manager（既有 no-access UI pattern）", () => {
    expect(src).toContain("if (!canViewRoomPrice) {");
    expect(src).toContain("沒有存取權限");
  });

  it("Pricing.tsx basic tab 的新增專案按鈕由 room_price 控制", () => {
    expect(pricingSrc).toContain("canEditModule('room_price')");
    expect(pricingSrc).toContain("canEditRoomPrice ? (");
  });
});

describe("readonly：write handler code-level guard（不能只藏按鈕）", () => {
  const handlers = [
    "const handleAddNew",
    "const handleEdit",
    "const handleSubmit",
    "const handleCopy",
    "const handleDelete",
    "const handleDragEnd",
  ];

  it.each(handlers)("%s 具備 canEditRoomPrice guard", (name) => {
    const body = src.slice(src.indexOf(name), src.indexOf(name) + 400);
    expect(body).toContain("if (!canEditRoomPrice)");
  });

  it("confirmDelete 也有 guard", () => {
    const body = src.slice(src.indexOf("const confirmDelete"));
    expect(body.slice(0, 400)).toContain("if (!canEditRoomPrice)");
  });

  it("新增/編輯/複製/刪除/拖曳 UI 皆隱藏於 readonly", () => {
    expect(src).toContain("{canEditRoomPrice && (");
    expect(src).toContain("{canEditRoomPrice && <div className=\"border-t border-border/40\" />}");
  });
});

describe("delete flow：RPC + row check", () => {
  const del = src.slice(src.indexOf("const confirmDelete"), src.indexOf("interface SortableTemplateCardProps"));

  it("STEP 1 只呼叫 clear_order_room_pricing_template，且只傳 _template_id", () => {
    expect(del).toContain("'clear_order_room_pricing_template'");
    expect(del).toContain("_template_id: deletingTemplate.id");
    expect(del).not.toContain("accommodation_id");
    expect(del).not.toContain("role");
  });

  it("移除舊有 order_rooms 直接 UPDATE / 無 fallback", () => {
    expect(src).not.toContain("from('order_rooms')");
  });

  it("移除 room_inventory_pricing 錯誤欄位寫入（template_clear / manual delete）", () => {
    expect(src).not.toContain("template_clear");
    expect(del).not.toContain("from('room_inventory_pricing')");
    expect(del).not.toContain("template_id: null");
  });

  it("RPC 結果驗證：error 檢查 + integer + >= 0（0 為合法成功）", () => {
    expect(del).toContain("if (rpcError)");
    expect(del).toContain("Number.isInteger(clearedCount)");
    expect(del).toContain("clearedCount < 0");
  });

  it("RPC 失敗時不執行 pricing_templates DELETE（throw 在 delete 之前）", () => {
    expect(del.indexOf("if (rpcError)")).toBeLessThan(del.indexOf("from('pricing_templates')"));
  });

  it("pricing_templates DELETE 使用 writeWithRowCheck + select('id')", () => {
    expect(del).toContain("writeWithRowCheck(");
    expect(del).toContain(".delete().eq('id', deletingTemplate.id).select('id')");
  });

  it("成功 toast 只在兩步都成功後出現", () => {
    expect(del.indexOf("writeWithRowCheck(")).toBeLessThan(del.indexOf("toast.success('專案已刪除')"));
  });
});
