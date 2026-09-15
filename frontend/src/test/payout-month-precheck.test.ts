import { describe, it, expect } from "vitest";
import { precheckPayoutMonth, nextMonthKey, isValidMonthKey } from "@/utils/payoutMonthCheck";

describe("isValidMonthKey", () => {
  it.each(["2026-01", "2026-12"])("合法 %s", (v) => expect(isValidMonthKey(v)).toBe(true));
  it.each(["2026-13", "2026-00", "2026-8", "202608", "2026/09", "", "bad", null, undefined, 202609, {}])(
    "不合法 %s",
    (v) => expect(isValidMonthKey(v as unknown)).toBe(false),
  );
});

describe("nextMonthKey", () => {
  it("一般月份 +1", () => expect(nextMonthKey("2026-08")).toBe("2026-09"));
  it("跨年", () => expect(nextMonthKey("2026-12")).toBe("2027-01"));
  it("格式錯誤回 null", () => expect(nextMonthKey("2026-8")).toBeNull());
  it("月份超界回 null", () => {
    expect(nextMonthKey("2026-13")).toBeNull();
    expect(nextMonthKey("2026-00")).toBeNull();
  });
});

describe("precheckPayoutMonth", () => {
  it("資料月 +1 相符 → clear", () => {
    const r = precheckPayoutMonth({ snapshotMonth: "2026-08", selectedYear: 2026, selectedMonth: 9 });
    expect(r.level).toBe("clear");
    expect(r.ok).toBe(true);
    expect(r.payoutMonth).toBe("2026-09");
  });

  it("發放月 = 資料月 → blocked（歷史錯誤情境）", () => {
    const r = precheckPayoutMonth({ snapshotMonth: "2026-08", selectedYear: 2026, selectedMonth: 8 });
    expect(r.level).toBe("blocked");
    expect(r.ok).toBe(false);
    expect(r.payoutMonth).toBeNull();
    expect(r.message).toContain("2026-09");
  });

  it("跨年時發放月 = 資料月（2026-12）→ blocked 且提示 2027-01", () => {
    const r = precheckPayoutMonth({ snapshotMonth: "2026-12", selectedYear: 2026, selectedMonth: 12 });
    expect(r.level).toBe("blocked");
    expect(r.message).toContain("2027-01");
  });

  it("跨年推算錯誤：資料月 2026-12 卻選 2026-01（倒退一年）→ warn 並提示預期 2027-01", () => {
    const r = precheckPayoutMonth({ snapshotMonth: "2026-12", selectedYear: 2026, selectedMonth: 1 });
    expect(r.level).toBe("warn");
    expect(r.expectedPayoutMonth).toBe("2027-01");
    expect(r.payoutMonth).toBe("2026-01");
  });

  it("發放月與預期不一致（非同月）→ warn，需二次確認", () => {
    const r = precheckPayoutMonth({ snapshotMonth: "2026-08", selectedYear: 2026, selectedMonth: 11 });
    expect(r.level).toBe("warn");
    expect(r.ok).toBe(true);
    expect(r.payoutMonth).toBe("2026-11");
    expect(r.expectedPayoutMonth).toBe("2026-09");
  });

  it.each(["", "2026-8", "202608", "2026/09", "2026-13", "2026-00", "bad"])(
    "資料月格式／範圍錯誤（%s）→ blocked 且不產生 payout_month",
    (snapshotMonth) => {
      const r = precheckPayoutMonth({ snapshotMonth, selectedYear: 2026, selectedMonth: 9 });
      expect(r.level).toBe("blocked");
      expect(r.ok).toBe(false);
      expect(r.payoutMonth).toBeNull();
      expect(r.message).toBeTruthy();
    },
  );

  it.each([0, 13, -1, 1.5, NaN])("選擇月份無效（%s）→ blocked", (selectedMonth) => {
    const r = precheckPayoutMonth({ snapshotMonth: "2026-08", selectedYear: 2026, selectedMonth });
    expect(r.level).toBe("blocked");
    expect(r.payoutMonth).toBeNull();
  });

  it("選擇年份無效 → blocked", () => {
    const r = precheckPayoutMonth({ snapshotMonth: "2026-08", selectedYear: NaN, selectedMonth: 9 });
    expect(r.level).toBe("blocked");
  });

  it("跨年：資料月 2026-12 → 預期 2027-01", () => {
    const r = precheckPayoutMonth({ snapshotMonth: "2026-12", selectedYear: 2027, selectedMonth: 1 });
    expect(r.level).toBe("clear");
    expect(r.payoutMonth).toBe("2027-01");
  });

  it("單位數月份補零：資料月 2026-01 → 2026-02", () => {
    const r = precheckPayoutMonth({ snapshotMonth: "2026-01", selectedYear: 2026, selectedMonth: 2 });
    expect(r.level).toBe("clear");
    expect(r.payoutMonth).toBe("2026-02");
  });
});
