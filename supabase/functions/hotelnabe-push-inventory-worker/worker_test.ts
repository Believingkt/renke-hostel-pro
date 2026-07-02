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

// ---------- Lock-in: quantity 0 + Close / Open pairing ----------

Deno.test("lock: remaining=0 → BookingLimit=0 + Close, pair emitted", () => {
  const msgs = mergeConsecutive(
    [{ date: "2099-05-01", remaining: 0, is_available: true }],
    "1063",
  );
  assertEquals(msgs.length, 2);
  assertEquals(msgs[0].kind, "booking_limit");
  assertEquals((msgs[0] as any).bookingLimit, 0);
  assertEquals(msgs[1].kind, "restriction");
  assertEquals((msgs[1] as any).status, "Close");
  assertEquals((msgs[1] as any).ratePlanCode, "-1");
  assertEquals((msgs[1] as any).invTypeCode, "1063");
});

Deno.test("lock: is_available=false with remaining>0 → BookingLimit=0 + Close", () => {
  const msgs = mergeConsecutive(
    [{ date: "2099-05-02", remaining: 5, is_available: false }],
    "1063",
  );
  assertEquals(msgs.length, 2);
  assertEquals((msgs[0] as any).bookingLimit, 0);
  assertEquals((msgs[1] as any).status, "Close");
});

Deno.test("lock: remaining>0 && is_available=true → BookingLimit=remaining + Open", () => {
  const msgs = mergeConsecutive(
    [{ date: "2099-05-03", remaining: 3, is_available: true }],
    "1063",
  );
  assertEquals(msgs.length, 2);
  assertEquals((msgs[0] as any).bookingLimit, 3);
  assertEquals((msgs[1] as any).status, "Open");
});

Deno.test("lock: consecutive same (limit,status) merged into single segment (2 msgs)", () => {
  const msgs = mergeConsecutive(
    [
      { date: "2099-06-01", remaining: 2, is_available: true },
      { date: "2099-06-02", remaining: 2, is_available: true },
      { date: "2099-06-03", remaining: 2, is_available: true },
    ],
    "1063",
  );
  assertEquals(msgs.length, 2);
  assertEquals((msgs[0] as any).start, "2099-06-01");
  assertEquals((msgs[0] as any).end, "2099-06-03");
  assertEquals((msgs[1] as any).start, "2099-06-01");
  assertEquals((msgs[1] as any).end, "2099-06-03");
  assertEquals((msgs[0] as any).bookingLimit, 2);
  assertEquals((msgs[1] as any).status, "Open");
});

Deno.test("lock: value change splits segment; every segment emits BookingLimit + Restriction pair", () => {
  const msgs = mergeConsecutive(
    [
      { date: "2099-07-01", remaining: 2, is_available: true },   // Open,2
      { date: "2099-07-02", remaining: 0, is_available: true },   // Close,0
      { date: "2099-07-03", remaining: 3, is_available: false },  // Close,0 (avail=false)
      { date: "2099-07-04", remaining: 1, is_available: true },   // Open,1
    ],
    "1063",
  );
  // seg1: 07-01 Open/2 ; seg2: 07-02..07-03 Close/0 (merged) ; seg3: 07-04 Open/1
  assertEquals(msgs.length, 6);
  // Every segment: pair order = booking_limit then restriction
  for (let i = 0; i < msgs.length; i += 2) {
    assertEquals(msgs[i].kind, "booking_limit");
    assertEquals(msgs[i + 1].kind, "restriction");
    assertEquals((msgs[i] as any).start, (msgs[i + 1] as any).start);
    assertEquals((msgs[i] as any).end, (msgs[i + 1] as any).end);
  }
  // seg1
  assertEquals((msgs[0] as any).bookingLimit, 2);
  assertEquals((msgs[1] as any).status, "Open");
  // seg2 (merged Close/0 across 07-02..07-03)
  assertEquals((msgs[2] as any).start, "2099-07-02");
  assertEquals((msgs[2] as any).end, "2099-07-03");
  assertEquals((msgs[2] as any).bookingLimit, 0);
  assertEquals((msgs[3] as any).status, "Close");
  // seg3
  assertEquals((msgs[4] as any).start, "2099-07-04");
  assertEquals((msgs[4] as any).bookingLimit, 1);
  assertEquals((msgs[5] as any).status, "Open");
});

Deno.test("lock: same limit but different status must split (avail=false vs true both remaining=0/positive edge)", () => {
  const msgs = mergeConsecutive(
    [
      { date: "2099-08-01", remaining: 0, is_available: true },  // Close,0
      { date: "2099-08-02", remaining: 0, is_available: false }, // Close,0 → same → merge
    ],
    "1063",
  );
  // Both normalize to (0, Close) → merged single segment = 2 msgs
  assertEquals(msgs.length, 2);
  assertEquals((msgs[0] as any).start, "2099-08-01");
  assertEquals((msgs[0] as any).end, "2099-08-02");
});

Deno.test("mergeConsecutive — is_available=false forces limit=0", () => {
  const msgs = mergeConsecutive([
    { date: "2099-04-01", remaining: 3, is_available: false },
  ], "1063");
  assertEquals((msgs[0] as any).bookingLimit, 0);
});

// ---------- classifyRsErrors ----------

const rs450 = `<OTA_HotelAvailNotifRS xmlns="http://www.opentravel.org/OTA/2003/05" TimeStamp="2099-01-01T00:00:00" EchoToken="e" Version="1.0"><Errors><Error Type="3" Code="450" ShortText="please push price first(RatePlanCode:)(Max:2026-12-30)"/></Errors></OTA_HotelAvailNotifRS>`;

const rsOtherErr = `<OTA_HotelAvailNotifRS xmlns="http://www.opentravel.org/OTA/2003/05" TimeStamp="2099-01-01T00:00:00" EchoToken="e" Version="1.0"><Errors><Error Type="3" Code="497" ShortText="Invalid HotelCode"/></Errors></OTA_HotelAvailNotifRS>`;

const rsSuccess = `<OTA_HotelAvailNotifRS xmlns="http://www.opentravel.org/OTA/2003/05" TimeStamp="2099-01-01T00:00:00" EchoToken="e" Version="1.0"><Success/></OTA_HotelAvailNotifRS>`;

Deno.test("classifyRsErrors — 450 by code → no_price", () => {
  const parsed = parseHotelnabeAvailNotifRS(rs450);
  const cls = classifyRsErrors(parsed.errors);
  assertEquals(cls?.kind, "no_price");
  assertEquals(cls?.message.includes("450"), true);
  assertEquals(cls?.message.includes("please push price first"), true);
});

Deno.test("classifyRsErrors — ShortText 'push price first' triggers no_price even without code 450", () => {
  const cls = classifyRsErrors([{ type: "3", code: "999", message: "Please push price first for that date" }]);
  assertEquals(cls?.kind, "no_price");
});

Deno.test("classifyRsErrors — other error → other (retryable)", () => {
  const parsed = parseHotelnabeAvailNotifRS(rsOtherErr);
  const cls = classifyRsErrors(parsed.errors);
  assertEquals(cls?.kind, "other");
  assertEquals(cls?.message, "Invalid HotelCode");
});

Deno.test("classifyRsErrors — success (no errors) → null", () => {
  const parsed = parseHotelnabeAvailNotifRS(rsSuccess);
  assertEquals(parsed.errors.length, 0);
  assertEquals(classifyRsErrors(parsed.errors), null);
});
