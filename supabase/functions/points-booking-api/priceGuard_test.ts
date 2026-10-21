import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { findUnpricedNights, storedNightPrice } from "./priceGuard.ts";

const rows = (o: Record<string, [number | null, string | null]>) =>
  new Map(Object.entries(o).map(([d, [price, src]]) => [d, { price, last_change_source: src }]));

Deno.test("正常價格：全部通過", () => {
  const r = findUnpricedNights(
    [{ date: "2026-12-01", price: 3000 }, { date: "2026-12-02", price: 3200 }],
    rows({ "2026-12-01": [3000, null], "2026-12-02": [3200, "manual"] }),
    2800,
  );
  assertEquals(r, []);
});

Deno.test("缺價、0 元、負數都被找出來", () => {
  const r = findUnpricedNights(
    [{ date: "2026-12-01", price: null }, { date: "2026-12-02", price: 0 }, { date: "2026-12-03", price: -5 }, { date: "2026-12-04", price: 3000 }],
    rows({ "2026-12-04": [3000, null] }),
    3000,
  );
  assertEquals(r, [
    { date: "2026-12-01", reason: "quote_missing" },
    { date: "2026-12-02", reason: "quote_zero" },
    { date: "2026-12-03", reason: "quote_zero" },
  ]);
});

Deno.test("專案有價但基底列 0 元（來源空白）→ 觸發器會寫成 0 元 → 擋", () => {
  const r = findUnpricedNights([{ date: "2026-12-01", price: 3000 }], rows({ "2026-12-01": [0, null] }), 2800);
  assertEquals(r, [{ date: "2026-12-01", reason: "stored_price_zero" }]);
});

Deno.test("基底列是 bulk_open 佔位價 → 觸發器改用房型基礎價", () => {
  assertEquals(storedNightPrice({ price: 0, last_change_source: "bulk_open" }, 2800), 2800);
  const r = findUnpricedNights([{ date: "2026-12-01", price: 3000 }], rows({ "2026-12-01": [0, "bulk_open"] }), 0);
  assertEquals(r, [{ date: "2026-12-01", reason: "stored_price_zero" }]);
});

Deno.test("基底列 price 為 null → 用房型基礎價", () => {
  assertEquals(storedNightPrice({ price: null, last_change_source: null }, 2500), 2500);
  assertEquals(storedNightPrice(undefined, null), null);
});
