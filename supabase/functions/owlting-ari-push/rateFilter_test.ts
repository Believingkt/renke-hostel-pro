import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { splitPushableRates } from "./rateFilter.ts";

Deno.test("0 元、負數、非數字的日期略過，其他照推", () => {
  const r = splitPushableRates([
    { room_type_id: "1001", date: "2026-12-01", price: 3000 },
    { room_type_id: "1001", date: "2026-12-02", price: 0 },
    { room_type_id: "1002", date: "2026-12-01", price: -1 },
    { room_type_id: "1002", date: "2026-12-02", price: NaN },
    { room_type_id: "1002", date: "2026-12-03", price: 4500 },
  ]);
  assertEquals(r.pushable.map((x) => `${x.room_type_id}|${x.date}|${x.price}`), ["1001|2026-12-01|3000", "1002|2026-12-03|4500"]);
  assertEquals(r.skipped, [
    { room_type_id: "1001", dates: ["2026-12-02"] },
    { room_type_id: "1002", dates: ["2026-12-01", "2026-12-02"] },
  ]);
});

Deno.test("全部有價 → 不略過", () => {
  const r = splitPushableRates([{ room_type_id: "1001", date: "2026-12-01", price: 1 }]);
  assertEquals(r.skipped, []);
  assertEquals(r.pushable.length, 1);
});
