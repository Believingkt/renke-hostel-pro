import { assertEquals, assertStringIncludes, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildHotelnabeAvailNotifRQ,
  parseHotelnabeAvailNotifRS,
  maskPasswordInXml,
} from "./xml.ts";

const COMMON = {
  echoToken: "LK-abc-123",
  hotelCode: "1886",
  requestorId: "INBOUND_X",
  password: "s3cret!",
  pmsName: "11",
};

Deno.test("BookingLimit message — own AvailStatusMessage, InvTypeCode=PMS code", () => {
  const xml = buildHotelnabeAvailNotifRQ({
    ...COMMON,
    messages: [{
      kind: "booking_limit",
      start: "2099-01-01", end: "2099-01-03",
      invTypeCode: "1063",
      bookingLimit: 5,
    }],
  });

  // EchoToken自產
  assertStringIncludes(xml, `EchoToken="LK-abc-123"`);
  // @Name 帶入 PMS_ID
  assertStringIncludes(xml, `Name="11"`);
  assertStringIncludes(xml, `Type="18"`);
  assertStringIncludes(xml, `ID="INBOUND_X"`);
  // HotelCode 在 AvailStatusMessages
  assertStringIncludes(xml, `AvailStatusMessages HotelCode="1886"`.replace(" HotelCode", ` HotelCode`));
  // BookingLimit attr 在 AvailStatusMessage 上
  assertStringIncludes(xml, `BookingLimit="5"`);
  // InvTypeCode=PMS code
  assertStringIncludes(xml, `InvTypeCode="1063"`);
  // 沒有 RestrictionStatus 與 BookingLimit 混合
  assert(!xml.includes("RestrictionStatus"));
  // 沒有 RatePlanCode（BookingLimit 訊息不需）
  assert(!xml.includes("RatePlanCode"));
});

Deno.test("Restriction message — RatePlanCode default -1, status Close", () => {
  const xml = buildHotelnabeAvailNotifRQ({
    ...COMMON,
    messages: [{
      kind: "restriction",
      start: "2099-02-01", end: "2099-02-05",
      invTypeCode: "1063",
      status: "Close",
    }],
  });
  assertStringIncludes(xml, `RatePlanCode="-1"`);
  assertStringIncludes(xml, `RestrictionStatus Status="Close"`.replace(" Status", ` Status`));
  // 沒有 BookingLimit
  assert(!xml.includes("BookingLimit"));
});

Deno.test("Restriction Open status", () => {
  const xml = buildHotelnabeAvailNotifRQ({
    ...COMMON,
    messages: [{ kind: "restriction", start: "2099-03-01", end: "2099-03-02", invTypeCode: "1063", status: "Open" }],
  });
  assertStringIncludes(xml, `Status="Open"`);
});

Deno.test("maskPasswordInXml removes MessagePassword value", () => {
  const xml = buildHotelnabeAvailNotifRQ({
    ...COMMON,
    messages: [{ kind: "restriction", start: "2099-01-01", end: "2099-01-02", invTypeCode: "1063", status: "Close" }],
  });
  const masked = maskPasswordInXml(xml);
  assert(!masked.includes("s3cret!"));
  assertStringIncludes(masked, `MessagePassword="***"`);
});

Deno.test("parseHotelnabeAvailNotifRS — Success", () => {
  const xml = `<?xml version="1.0"?>
<OTA_HotelAvailNotifRS xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="LK-abc-123" TimeStamp="2099-01-01T00:00:00Z" Version="1.0">
  <Success/>
</OTA_HotelAvailNotifRS>`;
  const r = parseHotelnabeAvailNotifRS(xml);
  assertEquals(r.success, true);
  assertEquals(r.echoToken, "LK-abc-123");
  assertEquals(r.errors.length, 0);
});

Deno.test("parseHotelnabeAvailNotifRS — Errors", () => {
  const xml = `<?xml version="1.0"?>
<OTA_HotelAvailNotifRS xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="x">
  <Errors><Error Type="3" Code="448" ShortText="System error">SYSTEM</Error></Errors>
</OTA_HotelAvailNotifRS>`;
  const r = parseHotelnabeAvailNotifRS(xml);
  assertEquals(r.success, false);
  assertEquals(r.errors.length, 1);
  assertEquals(r.errors[0].code, "448");
});
