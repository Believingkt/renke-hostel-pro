import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AmenityAvailability } from "@/lib/amenityAllocation";

const fetchOrderAllocations = vi.fn();
const fetchAmenityAvailability = vi.fn();

vi.mock("@/lib/amenityAllocation", () => ({
  fetchOrderAllocations: (...a: any[]) => fetchOrderAllocations(...a),
  fetchAmenityAvailability: (...a: any[]) => fetchAmenityAvailability(...a),
}));

import {
  computeAmenityConflicts,
  precheckAmenityReschedule,
  parseAmenityCapacityError,
  isAmenityCapacityError,
} from "../amenityRescheduleGuard";

const avail = (id: string, name: string, available: number, total = 3): AmenityAvailability => ({
  item: {
    id,
    accommodation_id: "acc",
    name,
    unit: null,
    total_quantity: total,
    notes: null,
    is_active: true,
    display_order: 0,
  },
  peakUsed: total - available,
  available,
});

beforeEach(() => {
  fetchOrderAllocations.mockReset();
  fetchAmenityAvailability.mockReset();
});

const base = {
  orderId: "o1",
  accommodationId: "acc",
  newCheckIn: "2026-09-27",
  newCheckOut: "2026-09-29",
};

describe("P2-3A amenity reschedule guard", () => {
  it("CASE A｜沒有備品：跳過且不查 availability", async () => {
    fetchOrderAllocations.mockResolvedValue({});
    const res = await precheckAmenityReschedule(base);
    expect(res.status).toBe("skipped");
    expect(fetchAmenityAvailability).not.toHaveBeenCalled();
  });

  it("CASE B｜足夠：ok", async () => {
    fetchOrderAllocations.mockResolvedValue({ a: 1 });
    fetchAmenityAvailability.mockResolvedValue([avail("a", "嬰兒床", 1)]);
    expect((await precheckAmenityReschedule(base)).status).toBe("ok");
  });

  it("CASE C｜單一不足", async () => {
    fetchOrderAllocations.mockResolvedValue({ a: 1 });
    fetchAmenityAvailability.mockResolvedValue([avail("a", "嬰兒床", 0)]);
    const res = await precheckAmenityReschedule(base);
    expect(res).toMatchObject({ status: "conflict" });
    if (res.status === "conflict") {
      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0]).toMatchObject({ name: "嬰兒床", required: 1, available: 0 });
    }
  });

  it("CASE D｜多個不足一次顯示", () => {
    const conflicts = computeAmenityConflicts(
      { a: 1, b: 1 },
      [avail("a", "嬰兒床", 0), avail("b", "消毒鍋", 0)],
    );
    expect(conflicts.map((c) => c.name)).toEqual(["嬰兒床", "消毒鍋"]);
  });

  it("CASE E｜部分足夠只列不足", () => {
    const conflicts = computeAmenityConflicts(
      { a: 1, c: 2 },
      [avail("a", "嬰兒床", 1), avail("c", "兒童椅", 1)],
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].name).toBe("兒童椅");
  });

  it("CASE F｜availability 必須排除本訂單", async () => {
    fetchOrderAllocations.mockResolvedValue({ a: 1 });
    fetchAmenityAvailability.mockResolvedValue([avail("a", "嬰兒床", 1)]);
    await precheckAmenityReschedule(base);
    expect(fetchAmenityAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ excludeOrderId: "o1", checkIn: "2026-09-27", checkOut: "2026-09-29" }),
    );
  });

  it("CASE H｜查詢失敗 → error（非阻擋）", async () => {
    fetchOrderAllocations.mockRejectedValue(new Error("boom"));
    const res = await precheckAmenityReschedule(base);
    expect(res.status).toBe("error");
  });

  it("CASE I｜trigger error parser", () => {
    const msg = "備品「嬰兒床」在 2026-09-28 已超過可用數量（總數 2，需求 3）";
    expect(isAmenityCapacityError(msg)).toBe(true);
    expect(parseAmenityCapacityError(msg)).toEqual({
      name: "嬰兒床",
      date: "2026-09-28",
      total: 2,
      demand: 3,
    });
  });

  it("CASE J/K/L｜其他錯誤不得誤判為備品", () => {
    expect(isAmenityCapacityError("所選日期庫存不足")).toBe(false);
    expect(isAmenityCapacityError("KOL 互惠額度已滿")).toBe(false);
    expect(isAmenityCapacityError("RPC_ERROR: something else")).toBe(false);
    expect(parseAmenityCapacityError(null)).toBeNull();
  });

  it("CASE M｜跨月 / 跨年區間原樣傳入 helper", async () => {
    fetchOrderAllocations.mockResolvedValue({ a: 1 });
    fetchAmenityAvailability.mockResolvedValue([avail("a", "嬰兒床", 1)]);
    await precheckAmenityReschedule({
      ...base,
      newCheckIn: "2026-12-31",
      newCheckOut: "2027-01-02",
    });
    expect(fetchAmenityAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ checkIn: "2026-12-31", checkOut: "2027-01-02" }),
    );
  });

  it("無效日期／退房未晚於入住 → skipped", async () => {
    expect((await precheckAmenityReschedule({ ...base, newCheckOut: "2026-09-27" })).status).toBe("skipped");
    expect((await precheckAmenityReschedule({ ...base, newCheckIn: "bad" })).status).toBe("skipped");
    expect(fetchOrderAllocations).not.toHaveBeenCalled();
  });
});

import { buildAmenityRestoreError } from "../amenityRescheduleGuard";

const AMENITY_MSG = "備品「嬰兒床」在 2026-09-28 已超過可用數量（總數 2，需求 3）";

describe("P2-3B 取消訂單復原備品錯誤 UX", () => {
  it("CASE A｜備品足夠（無 error）→ 不產生備品 UX", () => {
    expect(buildAmenityRestoreError({ fromStatus: "cancelled", toStatus: "confirmed", message: null })).toBeNull();
  });

  it("CASE B｜cancelled → confirmed 備品不足", () => {
    const r = buildAmenityRestoreError({ fromStatus: "cancelled", toStatus: "confirmed", message: AMENITY_MSG });
    expect(r?.title).toBe("無法恢復訂單：備品數量不足");
    expect(r?.description).toContain("嬰兒床");
    expect(r?.description).toContain("2026-09-28");
    expect(r?.description).toContain("此訂單尚未恢復");
  });

  it("CASE C｜cancelled → pending 備品不足", () => {
    expect(buildAmenityRestoreError({ fromStatus: "cancelled", toStatus: "pending", message: AMENITY_MSG })).not.toBeNull();
  });

  it("CASE D｜confirmed → cancelled 不觸發", () => {
    expect(buildAmenityRestoreError({ fromStatus: "confirmed", toStatus: "cancelled", message: AMENITY_MSG })).toBeNull();
  });

  it("CASE E｜confirmed → pending 不觸發", () => {
    expect(buildAmenityRestoreError({ fromStatus: "confirmed", toStatus: "pending", message: AMENITY_MSG })).toBeNull();
  });

  it("CASE F｜generic P0001 不誤判", () => {
    expect(buildAmenityRestoreError({ fromStatus: "cancelled", toStatus: "confirmed", message: "所選日期庫存不足" })).toBeNull();
  });

  it("CASE G｜network / generic error 維持原 UX", () => {
    expect(buildAmenityRestoreError({ fromStatus: "cancelled", toStatus: "confirmed", message: "Failed to fetch" })).toBeNull();
    expect(buildAmenityRestoreError({ fromStatus: "cancelled", toStatus: "confirmed", message: undefined })).toBeNull();
  });

  it("CASE H｜parser 無法完整解析時安全 fallback", () => {
    const r = buildAmenityRestoreError({
      fromStatus: "cancelled",
      toStatus: "confirmed",
      message: "備品「嬰兒床」已超過可用數量",
    });
    expect(r?.title).toBe("無法恢復訂單：備品數量不足");
    expect(r?.description).toContain("尚未恢復");
  });
});
