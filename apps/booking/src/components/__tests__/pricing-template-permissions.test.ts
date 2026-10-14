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

describe("新價格頁啟用館：專案價格唯讀、庫存量隱藏；未啟用館不變", () => {
  const pkgSrc = fs.readFileSync(path.resolve(__dirname, "../../pages/AdminPackages.tsx"), "utf8");

  it("PricingTemplateManager：唯讀條件 = 館別開關 + 已綁定 default_package_id", () => {
    expect(src).toContain("useAccommodationPriceFlags(accommodationId)");
    expect(src).toContain("const lockTplPrices = priceFlags.newPriceUiEnabled && !!(editingTemplate as any)?.default_package_id;");
  });

  it("PricingTemplateManager：三層價格與開關在唯讀時停用，並顯示提示", () => {
    for (const t of ["weekday", "peak", "weekend"]) {
      expect(src).toContain(`disabled={lockTplPrices || !formData.${t}_enabled}`);
    }
    expect(src.match(/disabled=\{lockTplPrices\}/g)?.length).toBe(3);
    expect(src).toContain("價格請到『房型與方案』編輯");
  });

  it("PricingTemplateManager：唯讀時存檔不送三層價格、price 與日型開關（code-level guard）", () => {
    const body = src.slice(src.indexOf("if (lockTplPrices) {"), src.indexOf("if (editingTemplate) {\n        const { error } = await supabase"));
    for (const k of ["weekday_price", "peak_price", "weekend_price", "'price'", "weekday_enabled", "peak_enabled", "weekend_enabled"]) {
      expect(body).toContain(k);
    }
    expect(body).toContain("delete dataToSave[k]");
  });

  it("PricingTemplateManager：庫存量只在啟用館隱藏（表單與卡片）", () => {
    expect(src).toContain("{!isTS && !priceFlags.newPriceUiEnabled && (");
    expect(src).toContain("{!priceFlags.newPriceUiEnabled && <div>");
  });

  it("AdminPackages：只有『編輯既有方案』且館別啟用時唯讀；新增方案不受影響", () => {
    expect(pkgSrc).toContain("const lockPrices = !!editing && priceFlags.newPriceUiEnabled;");
    expect(pkgSrc.match(/disabled=\{lockPrices\}/g)?.length).toBe(6);
    expect(pkgSrc).toContain("{!lockPrices && TIER_OPTIONS.filter");
    expect(pkgSrc).toContain("價格請到『房型與方案』編輯");
    const guard = pkgSrc.slice(pkgSrc.indexOf("if (lockPrices) {"), pkgSrc.indexOf("const { data: saved, error } = editing"));
    expect(guard).toContain("delete (payload as any).original_price;");
    expect(guard).toContain("delete (payload as any).sale_price;");
    expect(guard).toContain("delete (payload as any).tier_prices;");
    expect(guard).toContain("delete (payload as any).applicable_tiers;");
  });

  it("AdminPackages：適用日型與價格同一唯讀條件", () => {
    const tiers = pkgSrc.slice(pkgSrc.indexOf("<Label>適用日 *</Label>"), pkgSrc.indexOf("<Label>適用日 *</Label>") + 600);
    expect(tiers).toContain("disabled={lockPrices}");
  });

  it("兩個舊頁面：館別開關載入完成前或載入失敗時一律不可儲存（按鈕停用＋handler guard＋失敗提示）", () => {
    for (const s of [src, pkgSrc]) {
      expect(s).toContain("const flagsBlockSave = !priceFlags.loaded || priceFlags.failed;");
      expect(s).toContain("無法讀取館別設定，暫時無法儲存");
    }
    expect(pkgSrc).toContain("disabled={saving || flagsBlockSave}");
    expect(src).toContain("<Button onClick={handleSubmit} disabled={flagsBlockSave}");
    const pkgSave = pkgSrc.slice(pkgSrc.indexOf("const handleSave = async () => {"), pkgSrc.indexOf("const handleSave = async () => {") + 200);
    expect(pkgSave).toContain("if (flagsBlockSave) {");
    const tplSave = src.slice(src.indexOf("const handleSubmit = async () => {"), src.indexOf("const handleSubmit = async () => {") + 200);
    expect(tplSave).toContain("if (flagsBlockSave) {");
  });
});
