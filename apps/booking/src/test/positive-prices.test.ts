import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { positivePrices } from "@/lib/positivePrices";

describe("官網房型列表起價略過 0 元", () => {
  it("略過 0、負數、null", () => {
    expect(positivePrices([0, 3200, null, -1, 2800, undefined])).toEqual([3200, 2800]);
  });
  it("全部是 0 → 空陣列（和沒有價格一樣）", () => {
    expect(positivePrices([0, 0])).toEqual([]);
  });
  it("RoomsSection 三種價格都經過過濾", () => {
    const src = readFileSync(resolve(__dirname, "../components/RoomsSection.tsx"), "utf8");
    expect(src).toContain("const allPrices = positivePrices(data.map(item => item.price));");
    expect(src).toContain("positivePrices(data.map(item => item.price_2_meals))");
    expect(src).toContain("positivePrices(data.map(item => item.price_3_meals))");
  });
});
