// Tests for hotelnabe-retrieve-rooms xml builder/parser & mapping report
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildHotelnabeAvailRQ,
  parseHotelnabeAvailRS,
  buildMappingReport,
  maskPasswordInXml,
} from "./xml.ts";

const RS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelAvailRS xmlns="http://www.opentravel.org/OTA/2003/05"
    EchoToken="LK-ECHO-XYZ" Version="1.0" TimeStamp="2026-06-30T10:00:00+08:00">
  <Success/>
  <RoomStays>
    <RoomStay>
      <RoomTypes>
        <RoomType RoomID="HN-RM-501" RoomTypeCode="101"/>
        <RoomType RoomID="HN-RM-502" RoomTypeCode="102"/>
        <RoomType RoomID="HN-RM-503" RoomTypeCode="999"/>
        <RoomType RoomID="HN-RM-504"/>
      </RoomTypes>
    </RoomStay>
  </RoomStays>
</OTA_HotelAvailRS>`;

Deno.test("buildHotelnabeAvailRQ — EchoToken from PMS, password & PMS name attrs present", () => {
  const xml = buildHotelnabeAvailRQ({
    echoToken: "LK-ECHO-XYZ",
    hotelCode: "1886",
    requestorId: "lakeze",
    password: "topsecret",
    pmsName: "11",
    timeStamp: "2026-06-30T10:00:00+08:00",
  });
  assertStringIncludes(xml, `EchoToken="LK-ECHO-XYZ"`);
  assertStringIncludes(xml, `HotelCode="1886"`);
  assertStringIncludes(xml, `ID="lakeze"`);
  assertStringIncludes(xml, `MessagePassword="topsecret"`);
  assertStringIncludes(xml, `Type="18"`);
  assertStringIncludes(xml, `Name="11"`);
  assertStringIncludes(xml, "<OTA_HotelAvailRQ");
});

Deno.test("maskPasswordInXml masks MessagePassword but keeps EchoToken", () => {
  const xml = buildHotelnabeAvailRQ({
    echoToken: "LK-ECHO-XYZ",
    hotelCode: "1886",
    requestorId: "lakeze",
    password: "topsecret",
    pmsName: "11",
  });
  const masked = maskPasswordInXml(xml);
  assertStringIncludes(masked, `MessagePassword="***"`);
  assertEquals(masked.includes("topsecret"), false);
  assertStringIncludes(masked, `EchoToken="LK-ECHO-XYZ"`);
});

Deno.test("parseHotelnabeAvailRS — extracts RoomID + RoomTypeCode and EchoToken", () => {
  const parsed = parseHotelnabeAvailRS(RS_FIXTURE);
  assertEquals(parsed.echoToken, "LK-ECHO-XYZ");
  assertEquals(parsed.rooms.length, 4);
  assertEquals(parsed.rooms[0], { roomId: "HN-RM-501", roomTypeCode: "101" });
  assertEquals(parsed.rooms[3], { roomId: "HN-RM-504", roomTypeCode: null });
});

Deno.test("buildMappingReport — matched / missing / mismatch / unused classification", () => {
  const parsed = parseHotelnabeAvailRS(RS_FIXTURE);
  const ours = [
    { id: "u-1", name: "雙人房", numeric_code: 101 },
    { id: "u-2", name: "四人房", numeric_code: 102 },
    { id: "u-3", name: "VIP",    numeric_code: 200 }, // unused
    { id: "u-4", name: "雜物",   numeric_code: null }, // ignored (no code)
  ];
  const report = buildMappingReport(parsed.rooms, ours);

  assertEquals(report.matched.length, 2);
  assertEquals(report.matched[0].our_room_type_id, "u-1");
  assertEquals(report.matched[1].our_room_type_id, "u-2");

  assertEquals(report.missing_on_our_side.length, 1);
  assertEquals(report.missing_on_our_side[0].hotelnabe_room_type_code, "999");

  assertEquals(report.mismatch.length, 1);
  assertEquals(report.mismatch[0].hotelnabe_room_id, "HN-RM-504");

  assertEquals(report.unused_on_our_side.length, 1);
  assertEquals(report.unused_on_our_side[0].our_room_type_id, "u-3");

  assertEquals(report.totals.matched, 2);
  assertEquals(report.totals.missing, 1);
  assertEquals(report.totals.mismatch, 1);
  assertEquals(report.totals.unused, 1);
});

Deno.test("EchoToken generated PMS-side is reflected back into RQ unchanged", () => {
  const generated = `LK-${crypto.randomUUID()}`;
  const xml = buildHotelnabeAvailRQ({
    echoToken: generated,
    hotelCode: "1886",
    requestorId: "lakeze",
    password: "p",
    pmsName: "11",
  });
  assertStringIncludes(xml, `EchoToken="${generated}"`);
  assert(generated.startsWith("LK-"));
});
