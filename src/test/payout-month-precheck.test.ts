import { describe, it, expect } from "vitest";
import { precheckPayoutMonth, nextMonthKey } from "@/utils/payoutMonthCheck";

describe("nextMonthKey", () => {
  it("一般月份 +1", () => expect(nextMonthKey("2026-08")).toBe("2026-09"));
  it("跨年", () => expect(nextMonthKey("2026-12")).toBe("2027-01"));
  it("格式錯誤回 null", () => expect(nextMonthKey("2026-8")).toBeNull());
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

  it("發放月與預期不一致（非同月）→ warn，需二次確認", () => {
    const r = precheckPayoutMonth({ snapshotMonth: "2026-08", selectedYear: 2026, selectedMonth: 11 });
    expect(r.level).toBe("warn");
    expect(r.ok).toBe(true);
    expect(r.payoutMonth).toBe("2026-11");
    expect(r.expectedPayoutMonth).toBe("2026-09");
  });

  it("資料月格式錯誤 → blocked", () => {
    const r = precheckPayoutMonth({ snapshotMonth: "", selectedYear: 2026, selectedMonth: 9 });
    expect(r.level).toBe("blocked");
    expect(r.payoutMonth).toBeNull();
  });

  it("選擇月份無效 → blocked", () => {
    const r = precheckPayoutMonth({ snapshotMonth: "2026-08", selectedYear: 2026, selectedMonth: 13 });
    expect(r.level).toBe("blocked");
  });

  it("跨年：資料月 2026-12 → 預期 2027-01", () => {
    const r = precheckPayoutMonth({ snapshotMonth: "2026-12", selectedYear: 2027, selectedMonth: 1 });
    expect(r.level).toBe("clear");
    expect(r.payoutMonth).toBe("2027-01");
  });
});
