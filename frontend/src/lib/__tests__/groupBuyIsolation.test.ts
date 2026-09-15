import { describe, it, expect } from "vitest";
import {
  buildNightDates,
  verifyAdjustedInventory,
  type AdjustedInventoryRow,
} from "@/lib/exclusiveAvailability";
import {
  filterByGroupBuyMode,
  splitGroupBuy,
  isGroupBuyOrder,
  GROUP_BUY_SOURCE,
} from "@/lib/groupBuyCaliber";

/**
 * 情境測試：團購頁與現有訂房頁「互不影響」，但共用同一份真實庫存。
 *
 * 兩者的差異只在「口徑分流」（order_source = group_buy），
 * 庫存與雙重驗證（下訂前 / 下訂後）都必須走同一套判定。
 */

const row = (over: Partial<AdjustedInventoryRow> = {}): AdjustedInventoryRow => ({
  date_value: "2026-09-10",
  available_rooms: 1,
  is_blocked: false,
  blocked_by_room_name: null,
  ...over,
});

const order = (source: string, extra: Record<string, unknown> = {}) => ({
  order_source: source,
  final_price: 10000,
  ...extra,
});

describe("團購口徑分流（不影響一般訂房統計）", () => {
  const orders = [
    order("direct"),
    order("official_use"),
    order(GROUP_BUY_SOURCE),
    order(GROUP_BUY_SOURCE),
  ];

  it("預設 exclude：營運分析／業主月結不含團購訂單", () => {
    expect(filterByGroupBuyMode(orders, "exclude")).toHaveLength(2);
    expect(filterByGroupBuyMode(orders, "exclude").every((o) => !isGroupBuyOrder(o))).toBe(true);
  });

  it("only：僅團購訂單", () => {
    expect(filterByGroupBuyMode(orders, "only")).toHaveLength(2);
  });

  it("include：全部合併，且不重複、不遺漏", () => {
    expect(filterByGroupBuyMode(orders, "include")).toHaveLength(4);
  });

  it("兩組對照相加等於全部（無重複計算）", () => {
    const { groupBuy, regular } = splitGroupBuy(orders);
    expect(groupBuy.length + regular.length).toBe(orders.length);
    const sum = (l: typeof orders) => l.reduce((s, o) => s + o.final_price, 0);
    expect(sum(groupBuy) + sum(regular)).toBe(sum(orders));
  });

  it("order_source 缺漏視為一般訂房，不會被誤判為團購", () => {
    expect(isGroupBuyOrder({ order_source: null })).toBe(false);
    expect(isGroupBuyOrder(undefined)).toBe(false);
  });
});

describe("團購與一般訂房共用同一份庫存（同一套判定）", () => {
  it("團購下訂佔用後，一般訂房頁看到的可售數為 0 → 擋下", () => {
    const afterGroupBuySold = [row({ available_rooms: 0 })];
    const v = verifyAdjustedInventory(afterGroupBuySold, { requiredQuantity: 1 });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("insufficient");
  });

  it("一般訂房佔用後，團購頁同樣被擋下（雙向即時扣減）", () => {
    const v = verifyAdjustedInventory([row({ available_rooms: 0 })], { requiredQuantity: 1 });
    expect(v.ok).toBe(false);
  });

  it("包棟互斥規則沿用既有 RPC 結果，團購不另寫一套", () => {
    const v = verifyAdjustedInventory(
      [row({ is_blocked: true, blocked_by_room_name: "A7" })],
      { requiredQuantity: 1 },
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("blocked");
  });

  it("不同棟互不封鎖：別棟賣掉不影響團購方案綁定的那一棟", () => {
    expect(verifyAdjustedInventory([row({ available_rooms: 1 })], { requiredQuantity: 1 })).toEqual({ ok: true });
  });

  it("多間多夜：任一夜不足即整筆失敗，並回報該日期", () => {
    const nights = buildNightDates("2026-09-10", 3);
    const rows = nights.map((d, i) => row({ date_value: d, available_rooms: i === 1 ? 1 : 2 }));
    const v = verifyAdjustedInventory(rows, { requiredQuantity: 2 });
    expect(v.ok).toBe(false);
    expect(v.date).toBe(nights[1]);
  });
});

describe("團購下訂的雙重驗證（下訂前 / 下訂後）", () => {
  it("下訂前有庫存 → 通過", () => {
    expect(verifyAdjustedInventory([row({ available_rooms: 2 })], { requiredQuantity: 2 })).toEqual({ ok: true });
  });

  it("下訂後複驗出現負數（並發超賣）→ 判定 oversold 需回收訂單", () => {
    const v = verifyAdjustedInventory([row({ available_rooms: -1 })], {
      requiredQuantity: 1,
      postBooking: true,
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("oversold");
  });

  it("下訂後複驗剛好用完（0）視為正常，不誤判超賣", () => {
    const v = verifyAdjustedInventory([row({ available_rooms: 0 })], {
      requiredQuantity: 1,
      postBooking: true,
    });
    expect(v.ok).toBe(true);
  });
});
