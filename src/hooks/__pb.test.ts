import { describe, it, expect } from "vitest";
import { normalizePackageContents, defaultCountsFromBreakdown, defaultCountsByNameFromBreakdown } from "@/hooks/use-package-breakdown";

describe("normalizePackageContents", () => {
  it("非陣列回空", () => expect(normalizePackageContents(null)).toEqual([]));
  it("過濾無效列", () => {
    expect(normalizePackageContents([
      { id: "a", name: "雙人房", count: 3 },
      { id: "b", name: "", count: 2 },
      { id: "c", name: "四人房", count: 0 },
      { name: "無 id 房", count: 1 },
    ])).toEqual([
      { room_type_id: "a", name: "雙人房", count: 3 },
      { room_type_id: "無 id 房", name: "無 id 房", count: 1 },
    ]);
  });
});
describe("defaults", () => {
  const items = normalizePackageContents([{ id: "a", name: "雙人房", count: 3 }, { id: "b", name: "四人房", count: 2 }]);
  it("by id", () => expect(defaultCountsFromBreakdown(items)).toEqual({ a: 3, b: 2 }));
  it("by name", () => expect(defaultCountsByNameFromBreakdown(items)).toEqual({ "雙人房": 3, "四人房": 2 }));
  it("null 安全", () => expect(defaultCountsFromBreakdown(null)).toEqual({}));
});
