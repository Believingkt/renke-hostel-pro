import { describe, it, expect } from "vitest";
import {
  buildOrderAmenityMap,
  aggregateAmenitySummary,
  formatAmenityLine,
} from "../receptionAmenities";

const items = [
  { id: "crib", name: "嬰兒床", unit: "張", display_order: 1 },
  { id: "steri", name: "消毒鍋", unit: null, display_order: 2 },
  { id: "tub", name: "洗澡盆", unit: "個", display_order: 3 },
  { id: "chair", name: "兒童椅", unit: "張", display_order: 4 },
];

describe("Reception amenities", () => {
  it("CASE A｜單筆訂單顯示正確", () => {
    const map = buildOrderAmenityMap(
      [
        { order_id: "o1", amenity_item_id: "crib", quantity: 1 },
        { order_id: "o1", amenity_item_id: "steri", quantity: 1 },
      ],
      items,
    );
    expect(map["o1"].map(formatAmenityLine)).toEqual(["嬰兒床 ×1 張", "消毒鍋 ×1"]);
  });

  it("CASE B｜兩筆訂單彙總", () => {
    const map = buildOrderAmenityMap(
      [
        { order_id: "A", amenity_item_id: "crib", quantity: 1 },
        { order_id: "A", amenity_item_id: "tub", quantity: 1 },
        { order_id: "B", amenity_item_id: "crib", quantity: 2 },
        { order_id: "B", amenity_item_id: "chair", quantity: 1 },
      ],
      items,
    );
    const summary = aggregateAmenitySummary(["A", "B"], map);
    expect(summary.map((l) => [l.name, l.quantity])).toEqual([
      ["嬰兒床", 3],
      ["洗澡盆", 1],
      ["兒童椅", 1],
    ]);
  });

  it("CASE C｜無 allocation 訂單不產生 0 item", () => {
    const map = buildOrderAmenityMap(
      [{ order_id: "A", amenity_item_id: "crib", quantity: 1 }],
      items,
    );
    expect(map["B"]).toBeUndefined(); // UI 顯示 —
    const summary = aggregateAmenitySummary(["A", "B"], map);
    expect(summary).toHaveLength(1);
    expect(summary.every((l) => l.quantity > 0)).toBe(true);
  });

  it("CASE D｜cancelled order 不在名單即不計入", () => {
    // Reception 名單本身已 .neq(order_status,'cancelled')，彙總只吃傳入的 orderIds
    const map = buildOrderAmenityMap(
      [
        { order_id: "live", amenity_item_id: "crib", quantity: 1 },
        { order_id: "cancelled", amenity_item_id: "crib", quantity: 5 },
      ],
      items,
    );
    const summary = aggregateAmenitySummary(["live"], map);
    expect(summary).toEqual([
      expect.objectContaining({ name: "嬰兒床", quantity: 1 }),
    ]);
  });

  it("CASE E｜quantity 變更後重新建 map，單筆與總表同步（structured SoT）", () => {
    const before = buildOrderAmenityMap(
      [{ order_id: "A", amenity_item_id: "crib", quantity: 1 }],
      items,
    );
    const after = buildOrderAmenityMap(
      [{ order_id: "A", amenity_item_id: "crib", quantity: 4 }],
      items,
    );
    expect(before["A"][0].quantity).toBe(1);
    expect(after["A"][0].quantity).toBe(4);
    expect(aggregateAmenitySummary(["A"], after)[0].quantity).toBe(4);
  });

  it("CASE F｜改入住日：訂單移出當日名單即自動不計入，allocation 不變", () => {
    const map = buildOrderAmenityMap(
      [
        { order_id: "A", amenity_item_id: "crib", quantity: 1 },
        { order_id: "B", amenity_item_id: "tub", quantity: 2 },
      ],
      items,
    );
    // 今日名單只剩 A（B 改到明日）
    expect(aggregateAmenitySummary(["A"], map).map((l) => l.name)).toEqual(["嬰兒床"]);
    // 明日名單為 B，allocation 本體未變
    expect(aggregateAmenitySummary(["B"], map)).toEqual([
      expect.objectContaining({ name: "洗澡盆", quantity: 2 }),
    ]);
    expect(map["B"][0].quantity).toBe(2);
  });

  it("unit 為空時 fallback 不 hardcode 單位", () => {
    expect(formatAmenityLine({ itemId: "x", name: "床圍", unit: "  ", quantity: 1, displayOrder: 0 })).toBe(
      "床圍 ×1",
    );
  });

  it("忽略 quantity<=0 與未知 item", () => {
    const map = buildOrderAmenityMap(
      [
        { order_id: "A", amenity_item_id: "crib", quantity: 0 },
        { order_id: "A", amenity_item_id: "ghost", quantity: 3 },
      ],
      items,
    );
    expect(map["A"]).toBeUndefined();
  });
});

describe("selectSummaryOrderIds（Phase 2.1 日期語意）", () => {
  const orders = [
    { id: "A", check_in_date: "2026-08-28", check_out_date: "2026-08-30" },
    { id: "B", check_in_date: "2026-08-29", check_out_date: "2026-08-31" },
    { id: "C", check_in_date: "2026-08-29", check_out_date: "2026-08-30" },
  ];
  const items = [{ id: "crib", name: "嬰兒床", unit: "張", display_order: 1 }];
  const items2 = [
    { id: "crib", name: "嬰兒床", unit: "張", display_order: 1 },
    { id: "tub", name: "洗澡盆", unit: "個", display_order: 2 },
  ];

  it("CASE G｜續住不得重複進準備總表", () => {
    const map = buildOrderAmenityMap(
      [{ order_id: "A", amenity_item_id: "crib", quantity: 1 }],
      items,
    );
    expect(map["A"]).toHaveLength(1); // 單筆仍顯示
    const ids = selectSummaryOrderIds(orders, "2026-08-29", "checkin");
    expect(ids).not.toContain("A");
    expect(aggregateAmenitySummary(ids, map)).toEqual([]);
  });

  it("CASE H｜入住日要進準備", () => {
    const map = buildOrderAmenityMap(
      [{ order_id: "A", amenity_item_id: "crib", quantity: 1 }],
      items,
    );
    const ids = selectSummaryOrderIds(orders, "2026-08-28", "checkin");
    expect(aggregateAmenitySummary(ids, map)[0]).toMatchObject({ name: "嬰兒床", quantity: 1 });
  });

  it("CASE I｜退房日進回收", () => {
    const map = buildOrderAmenityMap(
      [{ order_id: "A", amenity_item_id: "crib", quantity: 1 }],
      items,
    );
    const ids = selectSummaryOrderIds(orders, "2026-08-30", "checkout");
    expect(ids).toContain("A");
    expect(aggregateAmenitySummary(ids, map)[0]).toMatchObject({ quantity: 1 });
  });

  it("CASE J｜住宿中途不進準備也不進回收", () => {
    const map = buildOrderAmenityMap(
      [{ order_id: "A", amenity_item_id: "crib", quantity: 1 }],
      items,
    );
    const onlyA = [orders[0]];
    expect(
      aggregateAmenitySummary(selectSummaryOrderIds(onlyA, "2026-08-29", "checkin"), map),
    ).toEqual([]);
    expect(
      aggregateAmenitySummary(selectSummaryOrderIds(onlyA, "2026-08-29", "checkout"), map),
    ).toEqual([]);
  });

  it("CASE K｜同日多筆加總，續住不計入", () => {
    const map = buildOrderAmenityMap(
      [
        { order_id: "A", amenity_item_id: "crib", quantity: 1 },
        { order_id: "B", amenity_item_id: "crib", quantity: 2 },
        { order_id: "C", amenity_item_id: "tub", quantity: 1 },
      ],
      items2,
    );
    const ids = selectSummaryOrderIds(orders, "2026-08-29", "checkin");
    expect(ids.sort()).toEqual(["B", "C"]);
    expect(aggregateAmenitySummary(ids, map)).toEqual([
      expect.objectContaining({ name: "嬰兒床", quantity: 2 }),
      expect.objectContaining({ name: "洗澡盆", quantity: 1 }),
    ]);
  });
});
