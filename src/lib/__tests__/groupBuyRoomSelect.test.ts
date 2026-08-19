import { describe, expect, it } from "vitest";
import {
  ROOM_SELECT_MESSAGES,
  selectRoomType,
} from "../../../supabase/functions/group-buy-create-order/groupBuyRoomSelect";

const A = { id: "A", capacity: 4 };
const B = { id: "B", capacity: 8 };

describe("selectRoomType", () => {
  it("A 容量不足但有庫存時，改分配容量足夠的 B", async () => {
    const res = await selectRoomType([A, B], 6, async () => true);
    expect(res.roomTypeId).toBe("B");
  });

  it("容量足夠者優先於順序：A 足夠時仍取 A", async () => {
    const res = await selectRoomType([A, B], 4, async () => true);
    expect(res.roomTypeId).toBe("A");
  });

  it("全部容量不足時不可建立訂單", async () => {
    const res = await selectRoomType([A, B], 12, async () => true);
    expect(res.roomTypeId).toBeNull();
    expect(res.failure).toBe("capacity");
    expect(ROOM_SELECT_MESSAGES[res.failure!]).toContain("無法容納此入住人數");
  });

  it("容量足夠但都沒庫存 → inventory 錯誤", async () => {
    const res = await selectRoomType([A, B], 4, async () => false);
    expect(res.roomTypeId).toBeNull();
    expect(res.failure).toBe("inventory");
  });

  it("容量不足＋沒庫存混合 → both", async () => {
    const res = await selectRoomType([A, B], 6, async () => false);
    expect(res.failure).toBe("both");
  });

  it("capacity <= 0 視為未設限", async () => {
    const res = await selectRoomType([{ id: "X", capacity: 0 }], 99, async () => true);
    expect(res.roomTypeId).toBe("X");
  });

  it("庫存只在容量足夠的房型上查詢（不浪費 RPC）", async () => {
    const checked: string[] = [];
    await selectRoomType([A, B], 6, async (id) => {
      checked.push(id);
      return true;
    });
    expect(checked).toEqual(["B"]);
  });
});
