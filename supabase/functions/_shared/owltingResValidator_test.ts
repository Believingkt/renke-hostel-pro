import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  validateOutboundResNotifXml,
  assertValidOutboundResNotifXml,
} from "./owltingResValidator.ts";

const FULL_BODY = `<?xml version="1.0"?>
<OTA_HotelResNotifRQ xmlns="x" Version="1.0" TimeStamp="2026-05-15T09:00:00+08:00" EchoToken="t" ResStatus="Cancel">
  <HotelReservations>
    <HotelReservation LastModifyDateTime="2026-05-15T09:00:00+08:00" ResStatus="Cancel">
      <UniqueID Type="14" ID="LAKEZE-X"/>
      <RoomStays>
        <RoomStay>
          <RoomTypes><RoomType RoomTypeCode="9001"/></RoomTypes>
          <RatePlans><RatePlan RatePlanCode="9101"/></RatePlans>
          <RoomRates>
            <RoomRate><Rates>
              <Rate EffectiveDate="2026-06-15" ExpireDate="2026-06-16">
                <Base AmountAfterTax="1" CurrencyCode="TWD"/>
              </Rate>
            </Rates></RoomRate>
          </RoomRates>
          <GuestCounts><GuestCount Count="1"/></GuestCounts>
          <TimeSpan Start="2026-06-15" End="2026-06-16"/>
        </RoomStay>
      </RoomStays>
      <ResGuests>
        <ResGuest PrimaryIndicator="true">
          <Profiles><ProfileInfo><Profile><Customer>
            <PersonName><GivenName>A</GivenName><Surname>B</Surname></PersonName>
          </Customer></Profile></ProfileInfo></Profiles>
        </ResGuest>
      </ResGuests>
      <ResGlobalInfo>
        <HotelReservationIDs><HotelReservationID ResID_Value="X"/></HotelReservationIDs>
      </ResGlobalInfo>
    </HotelReservation>
  </HotelReservations>
</OTA_HotelResNotifRQ>`;

Deno.test("validateOutboundResNotifXml: full Cancel body passes", () => {
  const r = validateOutboundResNotifXml(FULL_BODY);
  assertEquals(r.ok, true, r.errors.join(" | "));
});

Deno.test("validateOutboundResNotifXml: UniqueID-only Cancel rejected", () => {
  const minimal = `<OTA_HotelResNotifRQ ResStatus="Cancel">
    <HotelReservations>
      <HotelReservation LastModifyDateTime="2026-05-15T09:00:00+08:00" ResStatus="Cancel">
        <UniqueID Type="14" ID="X"/>
      </HotelReservation>
    </HotelReservations>
  </OTA_HotelResNotifRQ>`;
  const r = validateOutboundResNotifXml(minimal);
  assertEquals(r.ok, false);
  // Must complain about RoomStays / ResGuests / ResGlobalInfo
  const joined = r.errors.join(" ");
  assertEquals(joined.includes("<RoomStays>"), true);
  assertEquals(joined.includes("<ResGuests>"), true);
  assertEquals(joined.includes("<ResGlobalInfo>"), true);
});

Deno.test("validateOutboundResNotifXml: missing ResStatus rejected", () => {
  const xml = FULL_BODY.replace(/ResStatus="Cancel"/g, "");
  const r = validateOutboundResNotifXml(xml);
  assertEquals(r.ok, false);
});

Deno.test("validateOutboundResNotifXml: Commit needs CreateDateTime", () => {
  const xml = FULL_BODY
    .replace(/ResStatus="Cancel"/g, 'ResStatus="Commit"')
    .replace(/LastModifyDateTime="[^"]+"/g, "");
  const r = validateOutboundResNotifXml(xml);
  assertEquals(r.ok, false);
  assertEquals(r.errors.some((e) => e.includes("CreateDateTime")), true);
});

Deno.test("assertValidOutboundResNotifXml throws on invalid", () => {
  let threw = false;
  try {
    assertValidOutboundResNotifXml("<foo/>");
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
