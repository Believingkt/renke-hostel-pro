// Deno tests for hotelnabe-order-receiver xml parser & response builder
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseHotelnabeResNotifRQ,
  buildHotelnabeResNotifRS,
  maskPasswordInXml,
  isOlderThan,
} from "./xml.ts";

// ─── Fixtures (HotelNabe V1.0.2 examples) ───────────────────────────

const AUTH_OK = {
  id: "lakeze",
  pwd: "secret123",
};

function posBlock(id: string, pwd: string) {
  return `<POS>
    <Source>
      <RequestorID ID="${id}" MessagePassword="${pwd}" Type="22"/>
      <BookingChannel Type="2"><CompanyName Code="Hotelnabe">Hotelnabe</CompanyName></BookingChannel>
    </Source>
  </POS>`;
}

// 1) Expedia Book — new reservation, HotelCode=H001, RoomType numeric=101, RatePlan=2001
const FIXTURE_EXPEDIA_BOOK = `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelResNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05"
  EchoToken="ECHO-EXP-001" Version="1.0" TimeStamp="2026-06-26T12:00:00+08:00"
  ResStatus="Book">
  ${posBlock(AUTH_OK.id, AUTH_OK.pwd)}
  <HotelReservations>
    <HotelReservation CreateDateTime="2026-06-26T11:50:00+08:00"
                      LastModifyDateTime="2026-06-26T11:50:00+08:00"
                      ResStatus="Book">
      <UniqueID Type="14" ID="EXP-RES-99001" ResID_Source="Expedia" ResID_Value="EXP-RES-99001"/>
      <UniqueID Type="14" ID="NABE-1001" ResID_Source="Hotelnabe" ResID_Value="NABE-1001"/>
      <RoomStays>
        <RoomStay>
          <RoomTypes>
            <RoomType>
              <TPA_Extensions>
                <nabe:PMS xmlns:nabe="http://hotelnabe.com/ns" RoomTypeCode="101"/>
              </TPA_Extensions>
            </RoomType>
          </RoomTypes>
          <RoomRates>
            <nabe:RoomRate xmlns:nabe="http://hotelnabe.com/ns">
              <TPA_Extensions>
                <nabe:PMS RatePlanCode="2001"/>
              </TPA_Extensions>
            </nabe:RoomRate>
          </RoomRates>
          <GuestCounts>
            <GuestCount AgeQualifyingCode="10" Count="2"/>
            <GuestCount AgeQualifyingCode="8" Count="1"/>
          </GuestCounts>
          <TimeSpan Start="2026-07-10" End="2026-07-12"/>
          <Total AmountAfterTax="650000" CurrencyCode="TWD" DecimalPlaces="2"/>
          <BasicPropertyInfo HotelCode="H001"/>
        </RoomStay>
      </RoomStays>
      <ResGuests>
        <ResGuest>
          <Profiles>
            <ProfileInfo>
              <Profile>
                <Customer>
                  <PersonName>
                    <GivenName>太郎</GivenName>
                    <Surname>山田</Surname>
                  </PersonName>
                  <Telephone PhoneNumber="0912000111"/>
                  <Email>taro@example.com</Email>
                </Customer>
                <CompanyInfo><CompanyName Code="EXPEDIA">Expedia</CompanyName></CompanyInfo>
              </Profile>
            </ProfileInfo>
          </Profiles>
        </ResGuest>
      </ResGuests>
    </HotelReservation>
  </HotelReservations>
</OTA_HotelResNotifRQ>`;

// 2) Surehigh Modify — same key NABE-1001 but later LastModify, adults change
const FIXTURE_SUREHIGH_MODIFY = `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelResNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05"
  EchoToken="ECHO-SUR-002" Version="1.0" TimeStamp="2026-06-26T15:00:00+08:00">
  ${posBlock(AUTH_OK.id, AUTH_OK.pwd)}
  <HotelReservations>
    <HotelReservation LastModifyDateTime="2026-06-26T15:00:00+08:00" ResStatus="Modify">
      <UniqueID Type="14" ID="SH-RES-55" ResID_Source="Surehigh" ResID_Value="SH-RES-55"/>
      <UniqueID Type="14" ID="NABE-1001" ResID_Source="Hotelnabe" ResID_Value="NABE-1001"/>
      <RoomStays>
        <RoomStay>
          <RoomTypes>
            <RoomType>
              <TPA_Extensions>
                <nabe:PMS xmlns:nabe="http://hotelnabe.com/ns" RoomTypeCode="101"/>
              </TPA_Extensions>
            </RoomType>
          </RoomTypes>
          <RoomRates>
            <nabe:RoomRate xmlns:nabe="http://hotelnabe.com/ns">
              <TPA_Extensions>
                <nabe:PMS RatePlanCode="0"/>
              </TPA_Extensions>
            </nabe:RoomRate>
          </RoomRates>
          <GuestCounts>
            <GuestCount AgeQualifyingCode="10" Count="3"/>
          </GuestCounts>
          <TimeSpan Start="2026-07-10" End="2026-07-12"/>
          <Total AmountAfterTax="720000" CurrencyCode="TWD" DecimalPlaces="2"/>
          <BasicPropertyInfo HotelCode="H001"/>
        </RoomStay>
      </RoomStays>
    </HotelReservation>
  </HotelReservations>
</OTA_HotelResNotifRQ>`;

// 3) ezTravel Cancel
const FIXTURE_EZTRAVEL_CANCEL = `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelResNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05"
  EchoToken="ECHO-EZ-003" Version="1.0">
  ${posBlock(AUTH_OK.id, AUTH_OK.pwd)}
  <HotelReservations>
    <HotelReservation LastModifyDateTime="2026-06-26T18:30:00+08:00" ResStatus="Cancel">
      <UniqueID Type="14" ID="EZ-RES-77" ResID_Source="ezTravel" ResID_Value="EZ-RES-77"/>
      <UniqueID Type="14" ID="NABE-1002" ResID_Source="Hotelnabe" ResID_Value="NABE-1002"/>
      <RoomStays>
        <RoomStay>
          <RoomTypes>
            <RoomType>
              <TPA_Extensions>
                <nabe:PMS xmlns:nabe="http://hotelnabe.com/ns" RoomTypeCode="102"/>
              </TPA_Extensions>
            </RoomType>
          </RoomTypes>
          <RoomRates>
            <nabe:RoomRate xmlns:nabe="http://hotelnabe.com/ns">
              <TPA_Extensions>
                <nabe:PMS RatePlanCode="2002"/>
              </TPA_Extensions>
            </nabe:RoomRate>
          </RoomRates>
          <GuestCounts>
            <GuestCount AgeQualifyingCode="10" Count="2"/>
          </GuestCounts>
          <TimeSpan Start="2026-08-01" End="2026-08-02"/>
          <Total AmountAfterTax="380000" CurrencyCode="TWD" DecimalPlaces="2"/>
          <BasicPropertyInfo HotelCode="H001"/>
        </RoomStay>
      </RoomStays>
    </HotelReservation>
  </HotelReservations>
</OTA_HotelResNotifRQ>`;

// ─── Parser tests ───────────────────────────────────────────────────

Deno.test("parse Expedia Book: hotel code, numeric codes, amount restore", () => {
  const env = parseHotelnabeResNotifRQ(FIXTURE_EXPEDIA_BOOK);
  assertEquals(env.rootError, null);
  assertEquals(env.echoToken, "ECHO-EXP-001");
  assertEquals(env.posId, AUTH_OK.id);
  assertEquals(env.posPassword, AUTH_OK.pwd);

  assertEquals(env.reservations.length, 1);
  const r = env.reservations[0];
  assertEquals(r.hotelCode, "H001");
  assertEquals(r.hotelnabeResId, "NABE-1001");
  assertEquals(r.otaResId, "EXP-RES-99001");
  assertEquals(r.resStatus, "Book");
  assertEquals(r.roomTypeCode, 101);
  assertEquals(r.ratePlanCode, 2001);
  assertEquals(r.checkIn, "2026-07-10");
  assertEquals(r.checkOut, "2026-07-12");
  assertEquals(r.adults, 2);
  assertEquals(r.children, 1);
  assertEquals(r.currency, "TWD");
  // 650000 / 100 = 6500
  assertEquals(r.amountAfterTax, 6500);
  assertEquals(r.guestName, "山田太郎");
  assertEquals(r.guestPhone, "0912000111");
  assertEquals(r.guestEmail, "taro@example.com");
  assertEquals(r.otaCode, "EXPEDIA");
});

Deno.test("parse Surehigh Modify: RatePlanCode=0 means no package", () => {
  const env = parseHotelnabeResNotifRQ(FIXTURE_SUREHIGH_MODIFY);
  const r = env.reservations[0];
  assertEquals(r.resStatus, "Modify");
  assertEquals(r.ratePlanCode, 0);
  assertEquals(r.adults, 3);
  assertEquals(r.children, 0);
  // 720000/100 = 7200
  assertEquals(r.amountAfterTax, 7200);
  // null-safe: no ResGuests block
  assertEquals(r.guestName, null);
  assertEquals(r.guestEmail, null);
});

Deno.test("parse ezTravel Cancel", () => {
  const env = parseHotelnabeResNotifRQ(FIXTURE_EZTRAVEL_CANCEL);
  const r = env.reservations[0];
  assertEquals(r.resStatus, "Cancel");
  assertEquals(r.hotelnabeResId, "NABE-1002");
  assertEquals(r.otaResId, "EZ-RES-77");
  assertEquals(r.roomTypeCode, 102);
  assertEquals(r.ratePlanCode, 2002);
});

Deno.test("missing fields do not throw", () => {
  const xml = `<?xml version="1.0"?>
<OTA_HotelResNotifRQ EchoToken="X" Version="1.0">
  ${posBlock(AUTH_OK.id, AUTH_OK.pwd)}
  <HotelReservations>
    <HotelReservation ResStatus="Book"/>
  </HotelReservations>
</OTA_HotelResNotifRQ>`;
  const env = parseHotelnabeResNotifRQ(xml);
  assertEquals(env.rootError, null);
  const r = env.reservations[0];
  assertEquals(r.hotelCode, null);
  assertEquals(r.roomTypeCode, null);
  assertEquals(r.amountAfterTax, null);
  assertEquals(r.adults, 0);
});

// ─── isOlderThan ────────────────────────────────────────────────────

Deno.test("isOlderThan: stale skip logic", () => {
  assert(isOlderThan("2026-06-26T10:00:00+08:00", "2026-06-26T15:00:00+08:00"));
  assertEquals(isOlderThan("2026-06-26T15:00:00+08:00", "2026-06-26T10:00:00+08:00"), false);
  assertEquals(isOlderThan(null, "2026-06-26T10:00:00+08:00"), false);
  assertEquals(isOlderThan("bad", "2026-06-26T10:00:00+08:00"), false);
});

// ─── Response builder ───────────────────────────────────────────────

Deno.test("RS Success carries EchoToken and UniqueID Type=14", () => {
  const rs = buildHotelnabeResNotifRS({
    echoToken: "ECHO-EXP-001",
    successes: [{ recordId: "1", uniqueId: "order_abc123" }],
  });
  assertStringIncludes(rs, `EchoToken="ECHO-EXP-001"`);
  assertStringIncludes(rs, `<Success`);
  assertStringIncludes(rs, `Type="14"`);
  assertStringIncludes(rs, `order_abc123`);
});

Deno.test("RS Errors are exclusive with Success", () => {
  const rs = buildHotelnabeResNotifRS({
    echoToken: "E",
    errors: [{ type: "4", code: "497", message: "Authentication failed" }],
  });
  assertStringIncludes(rs, `Type="4"`);
  assertStringIncludes(rs, `Code="497"`);
  assert(!rs.includes("<Success"));
});

Deno.test("RS Error with RecordID for batch failure", () => {
  const rs = buildHotelnabeResNotifRS({
    echoToken: "E",
    errors: [
      { type: "3", code: "402", message: "RoomTypeCode 999 not mapped", recordId: "2" },
    ],
  });
  assertStringIncludes(rs, `RecordID="2"`);
  assertStringIncludes(rs, `Code="402"`);
});

// ─── Password masking ───────────────────────────────────────────────

Deno.test("maskPasswordInXml hides MessagePassword", () => {
  const masked = maskPasswordInXml(FIXTURE_EXPEDIA_BOOK);
  assert(!masked.includes(AUTH_OK.pwd));
  assertStringIncludes(masked, `MessagePassword="***"`);
});

// ─── Auth flow (echo token + 497) ───────────────────────────────────

Deno.test("auth failure produces 497 RS with echo token", () => {
  const env = parseHotelnabeResNotifRQ(
    FIXTURE_EXPEDIA_BOOK.replace(AUTH_OK.pwd, "WRONG"),
  );
  // Caller would compare env.posPassword vs secret and emit error if mismatch:
  const wrong = env.posPassword !== AUTH_OK.pwd;
  assert(wrong);
  const rs = buildHotelnabeResNotifRS({
    echoToken: env.echoToken,
    errors: [{ type: "4", code: "497", message: "Authentication failed" }],
  });
  assertStringIncludes(rs, `EchoToken="ECHO-EXP-001"`);
  assertStringIncludes(rs, `Code="497"`);
});
