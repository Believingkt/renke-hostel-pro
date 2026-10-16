import { describe, it, expect } from "vitest";
import { formatUnassignedRooms } from "@/utils/formatUnassignedRooms";

const roomTypes = [{ id: "rt-1", name: "B1-四人房" }];

describe("formatUnassignedRooms", () => {
  it("occupied 與 no_free_unit 各一筆", () => {
    const r = formatUnassignedRooms(
      [
        { room_type_id: "rt-1", requested_unit: "821", reason: "occupied" },
        { room_type_id: "rt-1", requested_unit: null, reason: "no_free_unit" },
      ],
      roomTypes,
      "請到訂單詳情手動安排",
    );
    expect(r?.items).toEqual(["B1-四人房（原指定 821，已被佔用）", "B1-四人房（無空房號）"]);
    expect(r?.text).toBe(
      "訂單已建立，但以下 2 間未分配房號，請到訂單詳情手動安排：B1-四人房（原指定 821，已被佔用）、B1-四人房（無空房號）",
    );
  });

  it("有 orderNumber 時 heading 帶訂單編號", () => {
    const r = formatUnassignedRooms(
      [{ room_type_id: "rt-1", requested_unit: "821", reason: "occupied" }],
      roomTypes,
      "請到訂單詳情手動安排",
      "EW12345",
    );
    expect(r?.heading).toBe("訂單 EW12345 已建立，但以下 1 間未分配房號，請到訂單詳情手動安排");
    expect(r?.text).toBe(
      "訂單 EW12345 已建立，但以下 1 間未分配房號，請到訂單詳情手動安排：B1-四人房（原指定 821，已被佔用）",
    );
  });

  it("房型名稱查不到時顯示「房型」，不顯示 uuid", () => {
    const uuid = "7f0c2a7e-1111-4222-8333-944455556666";
    const r = formatUnassignedRooms(
      [{ room_type_id: uuid, requested_unit: null, reason: "no_free_unit" }],
      roomTypes,
      "客服將協助安排",
    );
    expect(r?.items).toEqual(["房型（無空房號）"]);
    expect(r?.text).toBe("訂單已建立，但以下 1 間未分配房號，客服將協助安排：房型（無空房號）");
    expect(r?.text).not.toContain(uuid);
  });

  it("空陣列、undefined、非陣列都不顯示（回傳 null）", () => {
    expect(formatUnassignedRooms([], roomTypes, "x")).toBeNull();
    expect(formatUnassignedRooms(undefined, roomTypes, "x")).toBeNull();
    expect(formatUnassignedRooms({ foo: 1 }, roomTypes, "x")).toBeNull();
  });
});
