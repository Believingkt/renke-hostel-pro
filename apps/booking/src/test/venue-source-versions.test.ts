import { describe, it, expect } from "vitest";
import {
  currentVersion, effectiveExplain, isAllowedEffectiveFrom, selectableMonths, sourceDiff, upcomingVersions, versionStatus,
  type OverrideRow,
} from "@/lib/venueSourceVersions";

const row = (id: string, eff: string, src: string[] | null = ["website"], created = "2026-01-01T00:00:00Z"): OverrideRow =>
  ({ id, track: "shared", included_order_sources: src, effective_from: eff, created_at: created });

describe("venueSourceVersions", () => {
  it("可選月份從本月 1 日起、跨年正確", () => {
    expect(selectableMonths("2026-11-15", 3)).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
  });
  it("只接受本月或之後的 1 日", () => {
    expect(isAllowedEffectiveFrom("2026-06-01", "2026-06-15")).toBe(true);
    expect(isAllowedEffectiveFrom("2026-07-01", "2026-06-15")).toBe(true);
    expect(isAllowedEffectiveFrom("2026-05-01", "2026-06-15")).toBe(false);
    expect(isAllowedEffectiveFrom("2026-07-15", "2026-06-15")).toBe(false);
  });
  it("起算說明：資料月與次月 10 日發放", () => {
    expect(effectiveExplain("2026-07-01")).toBe("2026 年 7 月的訂單起算，2026 年 8 月 10 日發放的獎金開始採用");
    expect(effectiveExplain("2026-12-01")).toBe("2026 年 12 月的訂單起算，2027 年 1 月 10 日發放的獎金開始採用");
  });
  it("本月採用＝生效日 ≤ 本月 1 日的最新版；未來版本為已排定", () => {
    const rows = [row("a", "2026-04-01"), row("b", "2026-06-01", null), row("c", "2026-07-01")];
    expect(currentVersion(rows, "2026-06-01")?.id).toBe("b");
    expect(upcomingVersions(rows, "2026-06-01").map((r) => r.id)).toEqual(["c"]);
    expect(rows.map((r) => versionStatus(r, rows, "2026-06-01"))).toEqual(["history", "current", "future"]);
    expect(currentVersion([row("c", "2026-07-01")], "2026-06-01")).toBeNull();
  });
  it("與全站差異", () => {
    expect(sourceDiff(["a", "c"], ["a", "b"])).toEqual({ added: ["c"], removed: ["b"] });
  });
});
