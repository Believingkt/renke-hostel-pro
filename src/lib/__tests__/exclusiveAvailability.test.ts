import { describe, it, expect } from "vitest";
import {
  buildNightDates,
  verifyAdjustedInventory,
  describeInventoryVerdict,
  type AdjustedInventoryRow,
} from "@/lib/exclusiveAvailability";

/**
 * 雲岫海景渡假會館 A1–A7：每棟都是 is_exclusive_package，但彼此獨立。
 * RPC get_adjusted_room_inventory_batch 已依綁定關係計算，
 * 因此「別棟被訂走」不會在本棟的列上出現 is_blocked。
 */
const row = (over: Partial<AdjustedInventoryRow> = {}): AdjustedInventoryRow => ({
  date_value: "2026-08-20",
  available_rooms: 1,
  is_blocked: false,
  blocked_by_room_name: null,
  ...over,
});

describe("buildNightDates", () => {
  it("展開夜次日期且不含退房日", () => {
    expect(buildNightDates("2026-08-20", 2)).toEqual(["2026-08-20", "2026-08-21"]);
  });
  it("跨月正確進位", () => {
    expect(buildNightDates("2026-08-31", 2)).toEqual(["2026-08-31", "2026-09-01"]);
  });
  it("零晚回傳空陣列", () => {
    expect(buildNightDates("2026-08-20", 0)).toEqual([]);
  });
});

describe("A1–A7 互斥/非互斥規則", () => {
  it("A7 被訂走時，A1 仍可訂（不同棟互不封鎖）", () => {
    const a1Rows = [row({ available_rooms: 1, is_blocked: false })];
    expect(verifyAdjustedInventory(a1Rows, { requiredQuantity: 1 })).toEqual({ ok: true });
  });

  it("A1 自己被訂走 → 該棟不足，直接擋下", () => {
    const v = verifyAdjustedInventory([row({ available_rooms: 0 })], { requiredQuantity: 1 });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("insufficient");
    expect(v.date).toBe("2026-08-20");
  });

  it("綁定關係成立時（包棟 vs 旗下散客房）才回報互斥封鎖", () => {
    const v = verifyAdjustedInventory(
      [row({ is_blocked: true, blocked_by_room_name: "A7" })],
      { requiredQuantity: 1 },
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("blocked");
    expect(describeInventoryVerdict(v)).toContain("A7");
  });

  it("多夜中只要一天被封鎖就整筆失敗，並回報該日期", () => {
    const v = verifyAdjustedInventory(
      [
        row({ date_value: "2026-08-20" }),
        row({ date_value: "2026-08-21", is_blocked: true, blocked_by_room_name: "A3" }),
      ],
      { requiredQuantity: 1 },
    );
    expect(v.date).toBe("2026-08-21");
    expect(v.blockedByRoomName).toBe("A3");
  });

  it("散客房多間預訂：庫存足夠才放行", () => {
    const rows = [row({ available_rooms: 3 }), row({ date_value: "2026-08-21", available_rooms: 2 })];
    expect(verifyAdjustedInventory(rows, { requiredQuantity: 2 }).ok).toBe(true);
    expect(verifyAdjustedInventory(rows, { requiredQuantity: 3 }).ok).toBe(false);
  });

  it("接受 timestamp 型別的日期欄位", () => {
    const v = verifyAdjustedInventory(
      [row({ date_value: "2026-08-20T00:00:00.000Z", available_rooms: 0 })],
      { requiredQuantity: 1 },
    );
    expect(v.date).toBe("2026-08-20");
  });
});

describe("下訂後複驗（並發超賣）", () => {
  it("含本單後剩餘 0 屬正常，不判定失敗", () => {
    const v = verifyAdjustedInventory([row({ available_rooms: 0 })], {
      requiredQuantity: 1,
      postBooking: true,
    });
    expect(v.ok).toBe(true);
  });

  it("剩餘為負代表並發超賣，需回滾", () => {
    const v = verifyAdjustedInventory([row({ available_rooms: -1 })], {
      requiredQuantity: 1,
      postBooking: true,
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("oversold");
    expect(describeInventoryVerdict(v)).toContain("取消");
  });

  it("複驗時仍會偵測互斥封鎖", () => {
    const v = verifyAdjustedInventory(
      [row({ is_blocked: true, blocked_by_room_name: "A5", available_rooms: 0 })],
      { requiredQuantity: 1, postBooking: true },
    );
    expect(v.reason).toBe("blocked");
  });

  it("空資料視為通過（RPC 無回傳時不阻斷既有流程）", () => {
    expect(verifyAdjustedInventory([], { requiredQuantity: 2 }).ok).toBe(true);
    expect(verifyAdjustedInventory(null, { requiredQuantity: 2, postBooking: true }).ok).toBe(true);
  });
});
