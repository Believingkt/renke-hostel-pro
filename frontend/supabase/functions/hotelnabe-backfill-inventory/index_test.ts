import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mergeConsecutive, detectExpectedNoPriceDates } from "./index.ts";

Deno.test("mergeConsecutive: single day", () => {
  const out = mergeConsecutive([
    { date: "2026-07-01", remaining: 1, is_available: true, available_rooms: 1 },
  ]);
  assertEquals(out, [{ start: "2026-07-01", end: "2026-07-01", booking_limit: 1, nights: 1 }]);
});

Deno.test("mergeConsecutive: merges consecutive equal limits", () => {
  const out = mergeConsecutive([
    { date: "2026-07-01", remaining: 1, is_available: true, available_rooms: 1 },
    { date: "2026-07-02", remaining: 1, is_available: true, available_rooms: 1 },
    { date: "2026-07-03", remaining: 1, is_available: true, available_rooms: 1 },
  ]);
  assertEquals(out.length, 1);
  assertEquals(out[0], { start: "2026-07-01", end: "2026-07-03", booking_limit: 1, nights: 3 });
});

Deno.test("mergeConsecutive: closed days become limit=0 and split", () => {
  const out = mergeConsecutive([
    { date: "2026-07-01", remaining: 1, is_available: true, available_rooms: 1 },
    { date: "2026-07-02", remaining: 1, is_available: false, available_rooms: 1 }, // closed → 0
    { date: "2026-07-03", remaining: 1, is_available: true, available_rooms: 1 },
  ]);
  assertEquals(out.length, 3);
  assertEquals(out[1], { start: "2026-07-02", end: "2026-07-02", booking_limit: 0, nights: 1 });
});

Deno.test("mergeConsecutive: date gap breaks the run", () => {
  const out = mergeConsecutive([
    { date: "2026-07-01", remaining: 1, is_available: true, available_rooms: 1 },
    { date: "2026-07-03", remaining: 1, is_available: true, available_rooms: 1 },
  ]);
  assertEquals(out.length, 2);
});

Deno.test("detectExpectedNoPriceDates: dates beyond price_max flagged", () => {
  const out = detectExpectedNoPriceDates(
    ["2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01"],
    new Set(),
    "2026-12-30",
  );
  assertEquals(out, ["2026-12-31", "2027-01-01"]);
});

Deno.test("detectExpectedNoPriceDates: historical skips included", () => {
  const out = detectExpectedNoPriceDates(
    ["2026-07-01", "2026-07-02", "2026-07-03"],
    new Set(["2026-07-02"]),
    "2026-12-30",
  );
  assertEquals(out, ["2026-07-02"]);
});

Deno.test("detectExpectedNoPriceDates: none flagged when within range and no history", () => {
  const out = detectExpectedNoPriceDates(
    ["2026-07-01", "2026-07-02"],
    new Set(),
    "2026-12-30",
  );
  assertEquals(out, []);
});
