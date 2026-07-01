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
