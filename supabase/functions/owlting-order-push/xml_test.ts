import { assertEquals, assertStringIncludes, assertMatch, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildResNotifXml, buildResNotifRq, maskPasswordInXml, resolveRatePlan, type OwlOrderInput, type OwlConfig } from "./xml.ts";

const order: OwlOrderInput = {
  order_number: "ABC12345",
  check_in_date: "2030-05-01",
  check_out_date: "2030-05-03",
  guest_name: "王小明",
  guest_phone: "0912345678",
  guest_email: "test@example.com",
  total_amount: 6000,
  notes: "靠窗 & 高樓層",
  roomStays: [
    { roomTypeCode: 1001, ratePlanCode: 1001, roomTypeName: "雙人房", ratePlanName: "一泊一食", quantity: 1, unitAmount: 3000, adults: 2 },
    { roomTypeCode: 1002, ratePlanCode: 1001, roomTypeName: "三人房", quantity: 1, unitAmount: 3000, adults: 3 },
  ],
};

const config: OwlConfig = { owlting_hotel_code: "HOTEL001" };
const creds = { username: "u", password: "p@ss" };
const NOW = "2030-04-01T12:00:00.000Z";

Deno.test("Commit: CreateDateTime only, full structure", () => {
  const xml = buildResNotifXml(order, config, { resStatus: "Commit", echoToken: "E1", uniqueId: "ABC12345", nowIso: NOW }, creds);
  assertStringIncludes(xml, `ResStatus="Commit"`);
  assertStringIncludes(xml, `CreateDateTime="${NOW}"`);
  assert(!xml.includes("LastModifyDateTime="), "Commit must not contain LastModifyDateTime");
  // POS
  assertStringIncludes(xml, `Type="22" ID="LAKEZE"`);
  assertStringIncludes(xml, `Type="7" Primary="true"`);
  assertStringIncludes(xml, `Code="LAKEZE">人客多 LAKEZE`);
  // RoomStays + numeric codes
  assertStringIncludes(xml, `RoomTypeCode="1001"`);
  assertStringIncludes(xml, `RoomTypeCode="1002"`);
  assertStringIncludes(xml, `RatePlanCode="1001"`);
  assertStringIncludes(xml, `HotelCode="HOTEL001"`);
  // Amounts + currency
  assertStringIncludes(xml, `AmountAfterTax="3000" CurrencyCode="TWD"`);
  assertStringIncludes(xml, `AmountAfterTax="6000" CurrencyCode="TWD"`);
  // UniqueID + EchoToken
  assertStringIncludes(xml, `ID="ABC12345"`);
  assertStringIncludes(xml, `EchoToken="E1"`);
  // WS-Security
  assertStringIncludes(xml, `<wsse:Username>u</wsse:Username>`);
  assertStringIncludes(xml, `<wsse:Password`);
  // Two RoomStay elements
  const count = (xml.match(/<RoomStay>/g) ?? []).length;
  assertEquals(count, 2);
});

Deno.test("Modify: LastModifyDateTime only", () => {
  const xml = buildResNotifXml(order, config, { resStatus: "Modify", echoToken: "E2", uniqueId: "ABC12345", nowIso: NOW }, creds);
  assertStringIncludes(xml, `ResStatus="Modify"`);
  assertStringIncludes(xml, `LastModifyDateTime="${NOW}"`);
  assert(!xml.includes("CreateDateTime="), "Modify must not contain CreateDateTime");
  // Still full structure
  assertStringIncludes(xml, `<RoomStays>`);
  assertStringIncludes(xml, `HotelCode="HOTEL001"`);
});

Deno.test("Cancel: LastModifyDateTime + full structure (POS + RoomStays still present)", () => {
  const xml = buildResNotifXml(order, config, { resStatus: "Cancel", echoToken: "E3", uniqueId: "ABC12345", nowIso: NOW }, creds);
  assertStringIncludes(xml, `ResStatus="Cancel"`);
  assertStringIncludes(xml, `LastModifyDateTime="${NOW}"`);
  assert(!xml.includes("CreateDateTime="));
  assertStringIncludes(xml, `Type="22" ID="LAKEZE"`); // POS still present
  assertStringIncludes(xml, `<RoomStays>`);            // RoomStays still present
  assertStringIncludes(xml, `RoomTypeCode="1001"`);
});

Deno.test("UniqueID consistent across Commit / Modify / Cancel", () => {
  const u = "ABC12345";
  const c = buildResNotifRq(order, config, { resStatus: "Commit", echoToken: "x", uniqueId: u, nowIso: NOW });
  const m = buildResNotifRq(order, config, { resStatus: "Modify", echoToken: "x", uniqueId: u, nowIso: NOW });
  const x = buildResNotifRq(order, config, { resStatus: "Cancel", echoToken: "x", uniqueId: u, nowIso: NOW });
  for (const xml of [c, m, x]) {
    assertStringIncludes(xml, `<UniqueID Type="14" ID="ABC12345"/>`);
    assertStringIncludes(xml, `ResID_Value="ABC12345"`);
  }
});

Deno.test("maskPasswordInXml hides the password", () => {
  const xml = buildResNotifXml(order, config, { resStatus: "Commit", echoToken: "E", uniqueId: "U", nowIso: NOW }, creds);
  const masked = maskPasswordInXml(xml);
  assert(!masked.includes("p@ss"), "real password leaked");
  assertMatch(masked, /<wsse:Password[^>]*>\*{8}<\/wsse:Password>/);
});
