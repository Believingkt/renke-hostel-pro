import { assertEquals, assertStringIncludes, assertMatch, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildResNotifRq, resolveRatePlan, type OwlOrderInput, type OwlConfig } from "./xml.ts";

const order: OwlOrderInput = {
  order_number: "ABC12345",
  check_in_date: "2030-05-01",
  check_out_date: "2030-05-03",
  guest_name: "王小明",
  guest_phone: "0912345678",
  guest_email: "test@example.com",
  total_amount: 6000,
  deposit_amount: 1800,
  paid_amount: 0,
  payment_status: "unpaid",
  notes: "靠窗 & 高樓層",
  roomStays: [
    { roomTypeCode: 1001, ratePlanCode: 1001, roomTypeName: "雙人房", ratePlanName: "一泊一食", quantity: 1, unitAmount: 3000, adults: 2 },
    { roomTypeCode: 1002, ratePlanCode: 1001, roomTypeName: "三人房", quantity: 1, unitAmount: 3000, adults: 3 },
  ],
};

const config: OwlConfig = { owlting_hotel_code: "HOTEL001" };
const NOW = "2030-04-01T12:00:00.000Z";

Deno.test("Commit: bare OTA root, CreateDateTime only, no SOAP/wsse", () => {
  const xml = buildResNotifRq(order, config, { resStatus: "Commit", echoToken: "E1", uniqueId: "ABC12345", nowIso: NOW });
  // Root element + xml declaration
  assertMatch(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\s*<OTA_HotelResNotifRQ\b/);
  assertStringIncludes(xml, `xmlns="http://www.opentravel.org/OTA/2003/05"`);
  assertStringIncludes(xml, `ResStatus="Commit"`);
  assertStringIncludes(xml, `CreateDateTime="${NOW}"`);
  assert(!xml.includes("LastModifyDateTime="), "Commit must not contain LastModifyDateTime");
  // No SOAP envelope, no WS-Security
  assert(!/soap:Envelope/i.test(xml), "must not contain soap:Envelope");
  assert(!/wsse[:\s]/i.test(xml), "must not contain wsse namespace/elements");
  assert(!/UsernameToken/i.test(xml), "must not contain UsernameToken");
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
  // Two RoomStay elements
  const count = (xml.match(/<RoomStay>/g) ?? []).length;
  assertEquals(count, 2);
  // <Rate> must carry date span + unit attrs (OwlTing 0528 sample)
  assertStringIncludes(xml, `<Rate UnitMultiplier="1" RateTimeUnit="Day" EffectiveDate="2030-05-01" ExpireDate="2030-05-03">`);
  const rateCount = (xml.match(/<Rate\s/g) ?? []).length;
  assertEquals(rateCount, 2);
});

Deno.test("Modify / Cancel: <Rate> also carries EffectiveDate + ExpireDate", () => {
  for (const status of ["Modify", "Cancel"] as const) {
    const xml = buildResNotifRq(order, config, { resStatus: status, echoToken: "E", uniqueId: "ABC12345", nowIso: NOW });
    assertStringIncludes(xml, `EffectiveDate="2030-05-01"`);
    assertStringIncludes(xml, `ExpireDate="2030-05-03"`);
    assertStringIncludes(xml, `UnitMultiplier="1"`);
    assertStringIncludes(xml, `RateTimeUnit="Day"`);
  }
});

Deno.test("Modify: LastModifyDateTime only, no SOAP/wsse", () => {
  const xml = buildResNotifRq(order, config, { resStatus: "Modify", echoToken: "E2", uniqueId: "ABC12345", nowIso: NOW });
  assertStringIncludes(xml, `ResStatus="Modify"`);
  assertStringIncludes(xml, `LastModifyDateTime="${NOW}"`);
  assert(!xml.includes("CreateDateTime="), "Modify must not contain CreateDateTime");
  assert(!/soap:Envelope/i.test(xml));
  assert(!/wsse/i.test(xml));
  assertStringIncludes(xml, `<RoomStays>`);
  assertStringIncludes(xml, `HotelCode="HOTEL001"`);
});

Deno.test("Cancel: LastModifyDateTime + full RoomStays still present, no SOAP/wsse", () => {
  const xml = buildResNotifRq(order, config, { resStatus: "Cancel", echoToken: "E3", uniqueId: "ABC12345", nowIso: NOW });
  assertStringIncludes(xml, `ResStatus="Cancel"`);
  assertStringIncludes(xml, `LastModifyDateTime="${NOW}"`);
  assert(!xml.includes("CreateDateTime="));
  assert(!/soap:Envelope/i.test(xml));
  assert(!/wsse/i.test(xml));
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

Deno.test("Payload never contains credentials", () => {
  const xml = buildResNotifRq(order, config, { resStatus: "Commit", echoToken: "E", uniqueId: "U", nowIso: NOW });
  assert(!/Password/i.test(xml));
  assert(!/Username/i.test(xml));
  assert(!/UsernameToken/i.test(xml));
});

Deno.test("Notes are also sent as SpecialRequests so OwlNest 特殊需求 shows payment status", () => {
  const xml = buildResNotifRq(order, config, { resStatus: "Commit", echoToken: "E", uniqueId: "U", nowIso: NOW });
  assertStringIncludes(xml, `<OrderRemarks><OrderRemark>靠窗 &amp; 高樓層</OrderRemark></OrderRemarks>`);
  assertStringIncludes(xml, `<SpecialRequests><SpecialRequest><Text>靠窗 &amp; 高樓層</Text></SpecialRequest></SpecialRequests>`);
  const commentCount = (xml.match(/<Comments>/g) ?? []).length;
  assertEquals(commentCount, 3, "notes should be present on each RoomStay and ResGlobalInfo");
});

Deno.test("Unpaid PMS orders are marked deposit-required and pay-at-hotel", () => {
  const xml = buildResNotifRq(order, config, { resStatus: "Commit", echoToken: "E", uniqueId: "U", nowIso: NOW });
  assertStringIncludes(xml, `<Guarantee GuaranteeType="DepositRequired"/>`);
  assertStringIncludes(xml, `<DepositPayments><GuaranteePayment GuaranteeType="DepositRequired">`);
  assertStringIncludes(xml, `<AmountPercent Amount="1800" CurrencyCode="TWD" DecimalPlaces="0"/>`);
  assertStringIncludes(xml, `<AcceptableGuarantee PaymentType="PayAtHotel"/>`);
  assert(!xml.includes(`GuaranteeType="None"`), "unsettled deposit orders must not look like no-payment/no-guarantee bookings");
  assert(!xml.includes(`PaymentType="Prepaid"`), "unsettled deposit orders must not be sent as prepaid");
  assertStringIncludes(xml, `<Total AmountAfterTax="6000" CurrencyCode="TWD" Type="Net"/>`);
});

Deno.test("Fully paid PMS orders are the only payloads marked prepaid", () => {
  const paidOrder: OwlOrderInput = { ...order, payment_status: "paid", paid_amount: 6000 };
  const xml = buildResNotifRq(paidOrder, config, { resStatus: "Commit", echoToken: "E", uniqueId: "U", nowIso: NOW });
  assertStringIncludes(xml, `<Guarantee GuaranteeType="PrePay"/>`);
  assertStringIncludes(xml, `<GuaranteePayment GuaranteeType="PrePay">`);
  assertStringIncludes(xml, `<AcceptableGuarantee PaymentType="Prepaid"/>`);
});

// ---- resolveRatePlan strictly uses order.package_id ----
const pkgs = [
  { id: "pkg-a", name: "6人包區",  numeric_code: 1001 },
  { id: "pkg-b", name: "8人包區",  numeric_code: 1002 },
  { id: "pkg-c", name: "未編號方案", numeric_code: null },
];

Deno.test("resolveRatePlan: package_id present -> returns correct code", () => {
  const r = resolveRatePlan("pkg-b", pkgs);
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.code, 1002);
    assertEquals(r.name, "8人包區");
  }
});

Deno.test("resolveRatePlan: package_id null -> fail (no guessing)", () => {
  const r = resolveRatePlan(null, pkgs);
  assertEquals(r.ok, false);
  if (!r.ok) assertStringIncludes(r.reason, "no rate plan");
});

Deno.test("resolveRatePlan: package_id undefined -> fail", () => {
  const r = resolveRatePlan(undefined, pkgs);
  assertEquals(r.ok, false);
});

Deno.test("resolveRatePlan: package_id not in accommodation packages -> fail", () => {
  const r = resolveRatePlan("pkg-other", pkgs);
  assertEquals(r.ok, false);
  if (!r.ok) assertStringIncludes(r.reason, "not found");
});

Deno.test("resolveRatePlan: package without numeric_code -> fail", () => {
  const r = resolveRatePlan("pkg-c", pkgs);
  assertEquals(r.ok, false);
  if (!r.ok) assertStringIncludes(r.reason, "numeric_code");
});

Deno.test("resolveRatePlan: does NOT fall back to lowest numeric_code when missing", () => {
  const r = resolveRatePlan(null, pkgs);
  assertEquals(r.ok, false);
});
