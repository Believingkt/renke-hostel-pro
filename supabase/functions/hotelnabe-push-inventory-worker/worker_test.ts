import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mergeConsecutive, classifyRsErrors } from "./index.ts";
import { parseHotelnabeAvailNotifRS } from "./xml.ts";

Deno.test("mergeConsecutive — all same limit merged", () => {
  const msgs = mergeConsecutive([
    { date: "2099-01-01", remaining: 3, is_available: true },
    { date: "2099-01-02", remaining: 3, is_available: true },
    { date: "2099-01-03", remaining: 3, is_available: true },
  ], "1063");
  assertEquals(msgs.length, 1);
  assertEquals((msgs[0] as any).start, "2099-01-01");
  assertEquals((msgs[0] as any).end, "2099-01-03");
  assertEquals((msgs[0] as any).bookingLimit, 3);
});

Deno.test("mergeConsecutive — split on value change", () => {
  const msgs = mergeConsecutive([
    { date: "2099-02-01", remaining: 2, is_available: true },
    { date: "2099-02-02", remaining: 2, is_available: true },
    { date: "2099-02-03", remaining: 0, is_available: false }, // closed → 0
    { date: "2099-02-04", remaining: 1, is_available: true },
  ], "1063");
  assertEquals(msgs.length, 3);
  assertEquals((msgs[0] as any).end, "2099-02-02");
  assertEquals((msgs[0] as any).bookingLimit, 2);
  assertEquals((msgs[1] as any).start, "2099-02-03");
  assertEquals((msgs[1] as any).bookingLimit, 0);
  assertEquals((msgs[2] as any).start, "2099-02-04");
  assertEquals((msgs[2] as any).bookingLimit, 1);
});

Deno.test("mergeConsecutive — split on date gap", () => {
  const msgs = mergeConsecutive([
    { date: "2099-03-01", remaining: 5, is_available: true },
    { date: "2099-03-03", remaining: 5, is_available: true }, // gap
  ], "1063");
  assertEquals(msgs.length, 2);
  assertEquals((msgs[0] as any).end, "2099-03-01");
  assertEquals((msgs[1] as any).start, "2099-03-03");
});

Deno.test("mergeConsecutive — is_available=false forces limit=0", () => {
  const msgs = mergeConsecutive([
    { date: "2099-04-01", remaining: 3, is_available: false },
  ], "1063");
  assertEquals((msgs[0] as any).bookingLimit, 0);
});
