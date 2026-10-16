import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { decideOrderRoomsSave } from "@/lib/orderRoomsSaveGuard";

const src = fs.readFileSync(path.resolve(__dirname, "../pages/OrderDetail.tsx"), "utf8");

describe("decideOrderRoomsSave：房間明細存檔判定", () => {
  const base = { roomsLoaded: true, savedRoomCount: 2, editRoomIds: ["a", "b"], syntheticDecision: null as any };

  it("讀取失敗／未讀到：跳過，不當成 0 筆", () => {
    expect(decideOrderRoomsSave({ ...base, roomsLoaded: false, editRoomIds: [] })).toEqual({ kind: "skip", reason: "rooms_not_loaded" });
  });
  it("原本有明細、刪到 0 間：擋下", () => {
    expect(decideOrderRoomsSave({ ...base, editRoomIds: [] })).toEqual({ kind: "block", reason: "zero_rooms" });
  });
  it("原本就沒有明細、編輯也沒有：跳過，不呼叫 RPC", () => {
    expect(decideOrderRoomsSave({ ...base, savedRoomCount: 0, editRoomIds: [] })).toEqual({ kind: "skip", reason: "no_rooms" });
  });
  it("合成列未確認：要求確認；確認寫入：同步；選擇不寫：跳過", () => {
    const s = { ...base, savedRoomCount: 0, editRoomIds: ["synthetic-o1"] };
    expect(decideOrderRoomsSave(s)).toEqual({ kind: "confirm_synthetic" });
    expect(decideOrderRoomsSave({ ...s, syntheticDecision: "write" })).toEqual({ kind: "sync" });
    expect(decideOrderRoomsSave({ ...s, syntheticDecision: "skip" })).toEqual({ kind: "skip", reason: "synthetic_skipped" });
  });
  it("一般明細修改：同步", () => {
    expect(decideOrderRoomsSave(base)).toEqual({ kind: "sync" });
  });
});

describe("OrderDetail 房間明細安全（原始碼契約）", () => {
  it("order_rooms 讀取會檢查 error，失敗時設定錯誤並標記未載入", () => {
    expect(src).toContain("if (orderRoomsRes.error) {");
    expect(src).toContain("setOrderRoomsLoadError(orderRoomsRes.error.message");
    expect(src).toContain('data-testid="order-rooms-load-error"');
  });
  it("合成假房間只在 order_rooms 已成功載入後產生", () => {
    expect(src).toContain("if (order.room_type_id && orderRoomsLoaded) {");
    expect(src).toContain("if (!isEditing || !order || !orderRoomsLoaded) return;");
  });
  it("刪除房間按鈕先開確認對話框，不直接移除", () => {
    expect(src).toContain("onClick={() => setPendingRemoveRoomId(or.id)}");
    expect(src).not.toContain("onClick={() => setEditOrderRooms(prev => prev.filter(r => r.id !== or.id))}");
    expect(src).toContain('data-testid="order-room-remove-dialog"');
  });
  it("sync_order_rooms_v1 不再傳 null 的 p_expected_updated_at", () => {
    expect(src).not.toContain("p_expected_updated_at: null");
    expect(src).toContain("p_expected_updated_at: (afterFields as any).updated_at");
  });
  it("第一步前比對進入編輯時的 updated_at，且比對在 update_order_fields_v1 之前", () => {
    const save = src.indexOf("const handleSaveEdit = async () => {");
    const check = src.indexOf("openedUpdatedAtRef.current && (freshOrder as any).updated_at !== openedUpdatedAtRef.current", save);
    const step1 = src.indexOf('p_source: "admin_order_inline_edit"', save);
    expect(check).toBeGreaterThan(save);
    expect(check).toBeLessThan(step1);
  });
  it("第二步失敗顯示「欄位已存、明細未存」", () => {
    expect(src).toContain("訂單欄位已儲存，房間明細未儲存");
  });
});
