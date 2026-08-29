import { describe, expect, it } from "vitest";
import {
  ERROR_PEAK,
  IDLE_PEAK,
  LOADING_PEAK,
  checkTotalQuantityChange,
  extractFuturePeak,
} from "@/lib/amenityTotalGuard";

const ready = (peak: number, peakDate: string | null) =>
  ({ status: "ready", peak, peakDate }) as const;

describe("P2-2A 備品總數調降 pre-check", () => {
  it("CASE A：total 5 → 4，future peak 4，可以 Save", () => {
    const r = checkTotalQuantityChange({
      isEditing: true,
      currentTotal: 5,
      nextTotal: 4,
      peak: ready(4, "2026-09-26"),
    });
    expect(r.canSave).toBe(true);
    expect(r.error).toBeNull();
    expect(r.helper).toContain("總數不得低於 4");
  });

  it("CASE B：total 5 → 3，future peak 4，擋下並顯示 inline error", () => {
    const r = checkTotalQuantityChange({
      isEditing: true,
      currentTotal: 5,
      nextTotal: 3,
      peak: ready(4, "2026-09-26"),
    });
    expect(r.canSave).toBe(false);
    expect(r.error).toBe("無法將總數調整為 3。目前 2026-09-26 已分配 4 個，總數不得低於 4。");
  });

  it("CASE C：歷史 peak 6 不阻擋，future peak 2 時 5 → 2 可以 Save", () => {
    const rows = [
      { amenity_item_id: "a", usage_date: "2026-01-10", used_qty: 6 },
      { amenity_item_id: "a", usage_date: "2026-09-26", used_qty: 2 },
    ];
    const { peak, peakDate } = extractFuturePeak(rows, "a", "2026-08-29");
    expect(peak).toBe(2);
    expect(peakDate).toBe("2026-09-26");
    expect(
      checkTotalQuantityChange({
        isEditing: true,
        currentTotal: 5,
        nextTotal: 2,
        peak: ready(peak, peakDate),
      }).canSave,
    ).toBe(true);
  });

  it("CASE D：future peak 0，5 → 0 可以", () => {
    const r = checkTotalQuantityChange({
      isEditing: true,
      currentTotal: 5,
      nextTotal: 0,
      peak: ready(0, null),
    });
    expect(r.canSave).toBe(true);
    expect(r.helper).toBe("目前沒有今天以後的備品分配。");
  });

  it("CASE E：peak 查詢 loading 時降量 → Save disabled", () => {
    const r = checkTotalQuantityChange({
      isEditing: true,
      currentTotal: 5,
      nextTotal: 4,
      peak: LOADING_PEAK,
    });
    expect(r.canSave).toBe(false);
    expect(
      checkTotalQuantityChange({
        isEditing: true,
        currentTotal: 5,
        nextTotal: 4,
        peak: IDLE_PEAK,
      }).canSave,
    ).toBe(false);
  });

  it("CASE F：peak 查詢失敗時降量 → Save disabled 且有可讀錯誤", () => {
    const r = checkTotalQuantityChange({
      isEditing: true,
      currentTotal: 5,
      nextTotal: 4,
      peak: ERROR_PEAK,
    });
    expect(r.canSave).toBe(false);
    expect(r.error).toBe("無法確認目前備品分配量，請稍後再試。");
  });

  it("CASE G：peak 查詢失敗但為增量（5 → 6）或不變 → 不阻擋", () => {
    expect(
      checkTotalQuantityChange({
        isEditing: true,
        currentTotal: 5,
        nextTotal: 6,
        peak: ERROR_PEAK,
      }).canSave,
    ).toBe(true);
    expect(
      checkTotalQuantityChange({
        isEditing: true,
        currentTotal: 5,
        nextTotal: 5,
        peak: LOADING_PEAK,
      }).canSave,
    ).toBe(true);
  });

  it("CASE H/I：peak 來源沿用 get_amenity_daily_usage（cancelled 已由 RPC 排除，其餘 status 皆計入）", () => {
    // RPC 已排除 cancelled，因此回傳列即為有效 allocation（pending/confirmed/refunded）
    const rows = [
      { amenity_item_id: "a", usage_date: "2026-09-26", used_qty: 3 }, // pending + confirmed
      { amenity_item_id: "a", usage_date: "2026-09-27", used_qty: 1 }, // refunded
      { amenity_item_id: "b", usage_date: "2026-09-26", used_qty: 9 }, // 其他備品不計
    ];
    expect(extractFuturePeak(rows, "a", "2026-08-29")).toEqual({
      peak: 3,
      peakDate: "2026-09-26",
    });
  });

  it("CASE J：跨月／跨年未來住宿夜不會被漏掉", () => {
    const rows = [
      { amenity_item_id: "a", usage_date: "2026-09-26", used_qty: 2 },
      { amenity_item_id: "a", usage_date: "2027-02-14", used_qty: 5 },
    ];
    expect(extractFuturePeak(rows, "a", "2026-08-29")).toEqual({
      peak: 5,
      peakDate: "2027-02-14",
    });
  });

  it("新增備品時不套用 pre-check", () => {
    const r = checkTotalQuantityChange({
      isEditing: false,
      currentTotal: 0,
      nextTotal: 1,
      peak: ERROR_PEAK,
    });
    expect(r.canSave).toBe(true);
    expect(r.helper).toBeNull();
  });

  it("今天當日住宿夜計入 peak，昨天不計", () => {
    const rows = [
      { amenity_item_id: "a", usage_date: "2026-08-28", used_qty: 8 },
      { amenity_item_id: "a", usage_date: "2026-08-29", used_qty: 3 },
    ];
    expect(extractFuturePeak(rows, "a", "2026-08-29")).toEqual({
      peak: 3,
      peakDate: "2026-08-29",
    });
  });
});
