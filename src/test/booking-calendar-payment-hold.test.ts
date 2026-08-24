import { describe, expect, it } from "vitest";
import {
  expandPaymentHoldEvents,
  holdOccupiesDate,
  isActiveHold,
  packHoldRows,
  type PaymentHoldDraft,
} from "@/lib/paymentHoldEvents";

const NOW = new Date("2026-08-24T18:20:00Z").getTime();
const base: PaymentHoldDraft = {
  id: "d1",
  room_type_id: "A3",
  room_quantity: 1,
  check_in_date: "2026-09-07",
  check_out_date: "2026-09-08",
  status: "pending",
  expires_at: "2026-08-24T18:27:00Z",
  converted_order_id: null,
  guest_name: "test",
};

describe("預定管理付款保留顯示", () => {
  it("CASE 1: active hold 產生顯示事件", () => {
    const ev = expandPaymentHoldEvents([base], NOW);
    expect(ev).toHaveLength(1);
    expect(ev[0].roomTypeId).toBe("A3");
    expect(ev[0].guestName).toBe("test");
  });

  it("CASE 2: expired hold 不顯示", () => {
    expect(expandPaymentHoldEvents([{ ...base, expires_at: "2026-08-24T18:10:00Z" }], NOW)).toHaveLength(0);
  });

  it("CASE 3: failed hold 不顯示", () => {
    expect(isActiveHold({ ...base, status: "failed" }, NOW)).toBe(false);
  });

  it("CASE 4: cancelled hold 不顯示", () => {
    expect(isActiveHold({ ...base, status: "cancelled" }, NOW)).toBe(false);
  });

  it("CASE 5 / 11: converted hold 不顯示（避免與正式訂單 double display）", () => {
    expect(isActiveHold({ ...base, status: "paid", converted_order_id: "o1" }, NOW)).toBe(false);
    expect(expandPaymentHoldEvents([{ ...base, converted_order_id: "o1" }], NOW)).toHaveLength(0);
  });

  it("CASE 6: 9/7→9/8 只占 9/07", () => {
    const e = expandPaymentHoldEvents([base], NOW)[0];
    expect(holdOccupiesDate(e, "2026-09-07")).toBe(true);
    expect(holdOccupiesDate(e, "2026-09-08")).toBe(false);
  });

  it("CASE 7: 9/7→9/9 占 9/07、9/08，不占 9/09", () => {
    const e = expandPaymentHoldEvents([{ ...base, check_out_date: "2026-09-09" }], NOW)[0];
    expect(holdOccupiesDate(e, "2026-09-07")).toBe(true);
    expect(holdOccupiesDate(e, "2026-09-08")).toBe(true);
    expect(holdOccupiesDate(e, "2026-09-09")).toBe(false);
  });

  it("CASE 8: room_quantity = 2 展開兩份占用", () => {
    const ev = expandPaymentHoldEvents([{ ...base, room_quantity: 2 }], NOW);
    expect(ev).toHaveLength(2);
    expect(ev.map((e) => `${e.index}/${e.total}`)).toEqual(["1/2", "2/2"]);
    expect(packHoldRows(ev)).toHaveLength(2); // 重疊 → 兩列，不會誤看成 1 間
  });

  it("CASE 9: 最後一間被 hold 時仍產生顯示事件（庫存頁 0/1 與月曆一致）", () => {
    expect(expandPaymentHoldEvents([base], NOW)).toHaveLength(1);
  });

  it("CASE 10: 到期後（refetch/重算）事件消失", () => {
    const later = new Date("2026-08-24T18:28:00Z").getTime();
    expect(expandPaymentHoldEvents([base], later)).toHaveLength(0);
  });

  it("CASE 12: 沒有 room_type_id 或非 pending/processing 的資料不產生事件", () => {
    expect(expandPaymentHoldEvents([{ ...base, room_type_id: null }], NOW)).toHaveLength(0);
    expect(expandPaymentHoldEvents([{ ...base, status: "expired" }], NOW)).toHaveLength(0);
  });

  it("payment_processing 也視為 active hold", () => {
    expect(isActiveHold({ ...base, status: "payment_processing" }, NOW)).toBe(true);
  });

  it("不重疊的 hold 會排在同一列", () => {
    const ev = expandPaymentHoldEvents(
      [base, { ...base, id: "d2", check_in_date: "2026-09-09", check_out_date: "2026-09-10" }],
      NOW,
    );
    expect(packHoldRows(ev)).toHaveLength(1);
  });
});
