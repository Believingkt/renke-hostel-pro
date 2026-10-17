import { describe, it, expect } from "vitest";
import { cloneTemplatesForAccommodation } from "@/lib/onboarding/cloneTemplates";

const SRC = "acc-src";
const NEW = "acc-new";
const map = { "rt-src-1": "rt-new-1", "rt-src-2": "rt-new-2" };
const newRoomIds = new Set(Object.values(map));

describe("複製民宿：專案房型對應到新館", () => {
  const out = cloneTemplatesForAccommodation(
    [
      { id: "t1", accommodation_id: SRC, numeric_code: 1001, default_package_id: "pkg-src", room_type_id: "rt-src-1", room_type_ids: ["rt-src-1", "rt-src-2"], template_name: "A", created_at: "x", updated_at: "y" },
      { id: "t2", accommodation_id: SRC, numeric_code: 1002, default_package_id: null, room_type_id: "rt-other-acc", room_type_ids: ["rt-other-acc", "rt-src-2"], template_name: "B" },
      { id: "t3", accommodation_id: SRC, numeric_code: null, room_type_id: null, room_type_ids: null, template_name: "C" },
    ],
    NEW,
    map,
  );

  it("專案的房型全部屬於新館，無法對應的清空", () => {
    for (const t of out) {
      expect(t.accommodation_id).toBe(NEW);
      if (t.room_type_id !== null) expect(newRoomIds.has(t.room_type_id)).toBe(true);
      for (const rid of t.room_type_ids) expect(newRoomIds.has(rid)).toBe(true);
    }
    expect(out.map((t) => [t.room_type_id, t.room_type_ids])).toEqual([
      ["rt-new-1", ["rt-new-1", "rt-new-2"]],
      [null, ["rt-new-2"]],
      [null, []],
    ]);
  });

  it("不帶方案綁定、id、numeric_code、時間戳", () => {
    for (const t of out) {
      expect(t.default_package_id).toBeNull();
      expect(t).not.toHaveProperty("id");
      expect(t).not.toHaveProperty("numeric_code");
      expect(t).not.toHaveProperty("created_at");
      expect(t).not.toHaveProperty("updated_at");
    }
    expect(out.map((t) => t.template_name)).toEqual(["A", "B", "C"]);
  });
});
