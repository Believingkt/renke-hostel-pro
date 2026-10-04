import { describe, it, expect } from "vitest";
import { buildOrderAmenityMap, formatAmenityLine } from "@/lib/receptionAmenities";

const items = [
  { id: "i1", name: "嬰兒床", unit: "張", display_order: 1 },
  { id: "i2", name: "消毒鍋", unit: null, display_order: 2 },
];

// Export 欄位格式：與 dialog 相同（多行 join("\n")）
const exportCell = (map: ReturnType<typeof buildOrderAmenityMap>, orderId: string) =>
  (map[orderId] ?? []).map(formatAmenityLine).join("\n");

describe("Reception Export 備品分配欄", () => {
  it("CASE A: 多項備品逐行輸出", () => {
    const map = buildOrderAmenityMap(
      [
        { order_id: "A", amenity_item_id: "i1", quantity: 1 },
        { order_id: "A", amenity_item_id: "i2", quantity: 1 },
      ],
      items,
    );
    expect(exportCell(map, "A")).toBe("嬰兒床 ×1 張\n消毒鍋 ×1");
  });

  it("CASE B: 無 allocation 為空字串，非 undefined/null", () => {
    const map = buildOrderAmenityMap([], items);
    const cell = exportCell(map, "B");
    expect(cell).toBe("");
    expect(cell).not.toContain("undefined");
    expect(cell).not.toContain("null");
  });

  it("CASE C: unit 有值時附加 unit", () => {
    const map = buildOrderAmenityMap([{ order_id: "C", amenity_item_id: "i1", quantity: 1 }], items);
    expect(exportCell(map, "C")).toBe("嬰兒床 ×1 張");
  });

  it("CASE D: unit 為空不得多出 undefined", () => {
    const map = buildOrderAmenityMap([{ order_id: "D", amenity_item_id: "i2", quantity: 1 }], items);
    expect(exportCell(map, "D")).toBe("消毒鍋 ×1");
  });

  it("CASE E: 備註與備品分開，不互相污染", () => {
    const notes = "晚到，約 20:00 入住";
    const map = buildOrderAmenityMap([{ order_id: "E", amenity_item_id: "i1", quantity: 1 }], items);
    const row = { notes, amenities: exportCell(map, "E") };
    expect(row.notes).toBe("晚到，約 20:00 入住");
    expect(row.amenities).toBe("嬰兒床 ×1 張");
    expect(row.notes).not.toContain("嬰兒床");
    expect(row.amenities).not.toContain("晚到");
  });

  it("CASE F: 續住訂單仍輸出完整備品（不套用 summary filter）", () => {
    const map = buildOrderAmenityMap(
      [
        { order_id: "F", amenity_item_id: "i1", quantity: 2 },
        { order_id: "F", amenity_item_id: "i2", quantity: 1 },
      ],
      items,
    );
    expect(exportCell(map, "F")).toBe("嬰兒床 ×2 張\n消毒鍋 ×1");
  });
});
