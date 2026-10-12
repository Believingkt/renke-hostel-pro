import { describe, it, expect } from "vitest";
import { computePeriodMetrics, type PerfOrderInput } from "@lakeze/shared/utils/revenueByMonth";

// 期間：2026-09-01 ~ 2026-09-30（依住宿日）
const stayOpts = {
  basis: "stay" as const,
  periodStart: new Date("2026-09-01"),
  periodEndExcl: new Date("2026-10-01"),
  exclusiveRoomTypeIds: new Set<string>(),
  buildingRooms: 10,
};

describe("computePeriodMetrics 依住宿日", () => {
  it("#5 訂2間住2晚（9/10–9/12）→ 房晚4、營收全額、訂單1", () => {
    const orders: PerfOrderInput[] = [
      { order_status: "confirmed", final_price: 8000, check_in_date: "2026-09-10", check_out_date: "2026-09-12", room_quantity: 2, lock_whole_building: false, room_type_id: "r1" },
    ];
    const r = computePeriodMetrics(orders, stayOpts);
    expect(r.orderCount).toBe(1);
    expect(r.roomNights).toBe(4); // 2 晚 × 2 間
    expect(Math.round(r.revenue)).toBe(8000);
  });

  it("#6 已退房(checked_out) 與 入住中(checked_in) 皆計入；pending/cancelled 不計", () => {
    const orders: PerfOrderInput[] = [
      { order_status: "checked_out", final_price: 3000, check_in_date: "2026-09-05", check_out_date: "2026-09-06", room_quantity: 1, room_type_id: "r1" },
      { order_status: "checked_in", final_price: 3000, check_in_date: "2026-09-07", check_out_date: "2026-09-08", room_quantity: 1, room_type_id: "r1" },
      { order_status: "pending", final_price: 9999, check_in_date: "2026-09-09", check_out_date: "2026-09-10", room_quantity: 1, room_type_id: "r1" },
      { order_status: "cancelled", final_price: 9999, check_in_date: "2026-09-09", check_out_date: "2026-09-10", room_quantity: 1, room_type_id: "r1" },
    ];
    const r = computePeriodMetrics(orders, stayOpts);
    expect(r.orderCount).toBe(2);
    expect(r.roomNights).toBe(2);
    expect(Math.round(r.revenue)).toBe(6000);
  });

  it("夜數裁切到期間內；跨月訂單只算落在 9 月的夜（與驗收 SQL 口徑一致）", () => {
    // 8/30–9/3 住 4 晚，final 4000 → 每晚 1000；落在 9 月 = 9/1,9/2 共 2 晚
    const orders: PerfOrderInput[] = [
      { order_status: "confirmed", final_price: 4000, check_in_date: "2026-08-30", check_out_date: "2026-09-03", room_quantity: 1, room_type_id: "r1" },
    ];
    const r = computePeriodMetrics(orders, stayOpts);
    expect(r.orderCount).toBe(1);
    expect(r.roomNights).toBe(2);
    expect(Math.round(r.revenue)).toBe(2000);
  });

  it("包棟(lock_whole_building)每晚房間數＝該館可售房間總數", () => {
    const orders: PerfOrderInput[] = [
      { order_status: "confirmed", final_price: 50000, check_in_date: "2026-09-10", check_out_date: "2026-09-11", room_quantity: 1, lock_whole_building: true, room_type_id: "r1" },
    ];
    const r = computePeriodMetrics(orders, stayOpts);
    expect(r.roomNights).toBe(10); // 1 晚 × 10 間（整棟）
  });

  it("房型 is_exclusive_package 視為包棟", () => {
    const orders: PerfOrderInput[] = [
      { order_status: "confirmed", final_price: 50000, check_in_date: "2026-09-10", check_out_date: "2026-09-11", room_quantity: 1, room_type_id: "excl" },
    ];
    const r = computePeriodMetrics(orders, { ...stayOpts, exclusiveRoomTypeIds: new Set(["excl"]) });
    expect(r.roomNights).toBe(10);
  });
});

describe("computePeriodMetrics 依下訂日", () => {
  const bookingOpts = { ...stayOpts, basis: "booking" as const };
  it("整張訂單全額與全夜數計入（不裁切）", () => {
    const orders: PerfOrderInput[] = [
      { order_status: "confirmed", final_price: 4000, check_in_date: "2026-08-30", check_out_date: "2026-09-03", room_quantity: 2, room_type_id: "r1" },
    ];
    const r = computePeriodMetrics(orders, bookingOpts);
    expect(r.orderCount).toBe(1);
    expect(r.roomNights).toBe(8); // 4 晚 × 2 間（全額）
    expect(Math.round(r.revenue)).toBe(4000);
  });
});
