import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildOrderPayload,
  derivePaymentFromGuarantee,
  upsertHotelnabeOrderCore,
  type OrderUpsertPayload,
  type OrdersTableLike,
} from "./index.ts";
import { parseHotelnabeResNotifRQ, type ParsedReservation } from "./xml.ts";

function makeReservation(over: Partial<ParsedReservation> = {}): ParsedReservation {
  const base: ParsedReservation = {
    recordId: "1",
    hotelnabeResId: "HN-TEST-1",
    otaResId: "OTA-1",
    otaCode: "EXPE",
    resStatus: "Book",
    createDateTime: "2026-06-26T09:00:00+08:00",
    lastModifyDateTime: "2026-06-26T10:00:00+08:00",
    hotelCode: "1886",
    checkIn: "2026-08-01",
    checkOut: "2026-08-02",
    roomTypeCode: 1063,
    ratePlanCode: 1001,
    guestCounts: [],
    adults: 12,
    children: 0,
    currency: "TWD",
    amountAfterTax: 18000,
    decimalPlaces: 0,
    taxAmount: 0,
    guestName: "張小明",
    guestPhone: "0912345678",
    guestEmail: "test@example.com",
    guaranteeType: null,
    errors: [],
  };
  return { ...base, ...over };
}

const ACC = "8e3e8866-3cb0-4654-91f3-d9b09a543301";
const RT = "4567bcac-8938-4bc0-ae4f-1267e8533f81";
const PKG = "0c224457-ced2-4cf4-97a0-c16df778ea8e";

/** In-memory fake of OrdersTableLike with operation log. */
function makeFakeTable(initial: Array<{ id: string; hotelnabe_res_id: string; hotelnabe_last_modify: string | null; payload?: OrderUpsertPayload }> = []) {
  const rows = [...initial];
  const ops: Array<{ op: string; id?: string; payload?: unknown }> = [];

  const table: OrdersTableLike = {
    async findByHotelnabeResId(resId) {
      const r = rows.find((x) => x.hotelnabe_res_id === resId);
      return r ? { id: r.id, hotelnabe_last_modify: r.hotelnabe_last_modify } : null;
    },
    async insert(payload) {
      const id = `gen-${rows.length + 1}`;
      rows.push({
        id,
        hotelnabe_res_id: payload.hotelnabe_res_id!,
        hotelnabe_last_modify: payload.hotelnabe_last_modify,
        payload,
      });
      ops.push({ op: "insert", id, payload });
      return { id };
    },
    async updateById(id, patch) {
      const r = rows.find((x) => x.id === id);
      if (r) {
        r.payload = { ...(r.payload ?? {} as OrderUpsertPayload), ...patch } as OrderUpsertPayload;
        if (patch.hotelnabe_last_modify !== undefined) {
          r.hotelnabe_last_modify = patch.hotelnabe_last_modify;
        }
      }
      ops.push({ op: "update", id, payload: patch });
    },
  };

  return { table, rows, ops };
}

Deno.test("buildOrderPayload maps to real orders columns with safe defaults", () => {
  const p = buildOrderPayload({
    reservation: makeReservation(),
    accommodationId: ACC,
    roomTypeId: RT,
    packageId: PKG,
  });
  // Required NOT NULL columns are filled
  assertEquals(p.accommodation_id, ACC);
  assertEquals(p.room_type_id, RT);
  assertEquals(p.package_id, PKG);
  assertEquals(p.check_in_date, "2026-08-01");
  assertEquals(p.check_out_date, "2026-08-02");
  assertEquals(p.guest_count, 12);
  assertEquals(p.guest_name, "張小明");
  assertEquals(p.guest_phone, "0912345678");
  assertEquals(p.total_price, 18000);
  assertEquals(p.final_price, 18000);
  assertEquals(p.order_status, "confirmed");
  // Default (no DepositPayments info) → conservative unpaid
  assertEquals(p.payment_status, "unpaid");
  assertEquals(p.paid_amount, 0);
  assertEquals(p.order_source, "hotelnabe");
  assertEquals(p.ota_channel, "hotelnabe");
  assertEquals(p.hotelnabe_res_id, "HN-TEST-1");
  assertEquals(p.cancelled_at, null);
  assert(p.notes && p.notes.includes("HN-TEST-1"));
});

Deno.test("derivePaymentFromGuarantee: PrePay → paid, None/missing → unpaid", () => {
  assertEquals(derivePaymentFromGuarantee("PrePay", 38400), {
    payment_status: "paid",
    paid_amount: 38400,
  });
  assertEquals(derivePaymentFromGuarantee("prepay", 100), {
    payment_status: "paid",
    paid_amount: 100,
  });
  assertEquals(derivePaymentFromGuarantee("None", 38400), {
    payment_status: "unpaid",
    paid_amount: 0,
  });
  assertEquals(derivePaymentFromGuarantee(null, 38400), {
    payment_status: "unpaid",
    paid_amount: 0,
  });
});

Deno.test("buildOrderPayload PrePay → paid + paid_amount=amount", () => {
  const p = buildOrderPayload({
    reservation: makeReservation({ guaranteeType: "PrePay", amountAfterTax: 38400 }),
    accommodationId: ACC,
    roomTypeId: RT,
    packageId: PKG,
  });
  assertEquals(p.total_price, 38400);
  assertEquals(p.final_price, 38400);
  assertEquals(p.paid_amount, 38400);
  assertEquals(p.payment_status, "paid");
});

Deno.test("buildOrderPayload None → unpaid + paid_amount=0 (final_price preserved)", () => {
  const p = buildOrderPayload({
    reservation: makeReservation({ guaranteeType: "None", amountAfterTax: 38400 }),
    accommodationId: ACC,
    roomTypeId: RT,
    packageId: PKG,
  });
  assertEquals(p.final_price, 38400);
  assertEquals(p.paid_amount, 0);
  assertEquals(p.payment_status, "unpaid");
});

Deno.test("buildOrderPayload null-safe for missing optional guest fields", () => {
  const p = buildOrderPayload({
    reservation: makeReservation({
      guestName: null,
      guestPhone: null,
      guestEmail: null,
      otaCode: null,
      taxAmount: null,
      amountAfterTax: null,
      adults: 0,
      children: 0,
    }),
    accommodationId: ACC,
    roomTypeId: RT,
    packageId: null,
  });
  assertEquals(p.guest_name, "HotelNabe Guest");
  assertEquals(p.guest_phone, "0000000000");
  assertEquals(p.guest_email, null);
  assertEquals(p.package_id, null);
  assertEquals(p.total_price, 0);
  assertEquals(p.final_price, 0);
  assertEquals(p.guest_count, 1); // floor of 1
});

Deno.test("buildOrderPayload Cancel marks order cancelled with timestamp", () => {
  const p = buildOrderPayload({
    reservation: makeReservation({ resStatus: "Cancel" }),
    accommodationId: ACC,
    roomTypeId: RT,
    packageId: PKG,
  });
  assertEquals(p.order_status, "cancelled");
  assert(p.cancelled_at !== null);
});

Deno.test("upsertHotelnabeOrderCore inserts a brand-new Book reservation", async () => {
  const { table, rows, ops } = makeFakeTable();
  const payload = buildOrderPayload({
    reservation: makeReservation(),
    accommodationId: ACC,
    roomTypeId: RT,
    packageId: PKG,
  });
  const res = await upsertHotelnabeOrderCore(table, payload);
  assertEquals(res.action, "inserted");
  assertEquals(rows.length, 1);
  assertEquals(ops[0].op, "insert");
});

Deno.test("upsertHotelnabeOrderCore Modify performs full overwrite on existing row", async () => {
  const { table, rows, ops } = makeFakeTable([
    {
      id: "existing-1",
      hotelnabe_res_id: "HN-TEST-1",
      hotelnabe_last_modify: "2026-06-25T10:00:00+08:00",
    },
  ]);
  const payload = buildOrderPayload({
    reservation: makeReservation({
      resStatus: "Modify",
      adults: 14,
      amountAfterTax: 22000,
      lastModifyDateTime: "2026-06-26T11:00:00+08:00",
    }),
    accommodationId: ACC,
    roomTypeId: RT,
    packageId: PKG,
  });
  const res = await upsertHotelnabeOrderCore(table, payload);
  assertEquals(res.action, "updated");
  assertEquals(res.orderId, "existing-1");
  assertEquals(ops[0].op, "update");
  assertEquals(rows[0].payload?.total_price, 22000);
  assertEquals(rows[0].payload?.guest_count, 14);
});

Deno.test("upsertHotelnabeOrderCore Cancel marks existing row cancelled", async () => {
  const { table, rows } = makeFakeTable([
    {
      id: "existing-2",
      hotelnabe_res_id: "HN-TEST-1",
      hotelnabe_last_modify: "2026-06-25T10:00:00+08:00",
    },
  ]);
  const payload = buildOrderPayload({
    reservation: makeReservation({
      resStatus: "Cancel",
      lastModifyDateTime: "2026-06-26T12:00:00+08:00",
    }),
    accommodationId: ACC,
    roomTypeId: RT,
    packageId: PKG,
  });
  const res = await upsertHotelnabeOrderCore(table, payload);
  assertEquals(res.action, "updated");
  assertEquals(rows[0].payload?.order_status, "cancelled");
  assert(rows[0].payload?.cancelled_at !== null);
});

Deno.test("upsertHotelnabeOrderCore skips stale LastModifyDateTime", async () => {
  const { table, ops } = makeFakeTable([
    {
      id: "existing-3",
      hotelnabe_res_id: "HN-TEST-1",
      hotelnabe_last_modify: "2026-06-26T15:00:00+08:00",
    },
  ]);
  const payload = buildOrderPayload({
    reservation: makeReservation({
      resStatus: "Modify",
      lastModifyDateTime: "2026-06-26T09:00:00+08:00", // older
    }),
    accommodationId: ACC,
    roomTypeId: RT,
    packageId: PKG,
  });
  const res = await upsertHotelnabeOrderCore(table, payload);
  assertEquals(res.action, "stale_skipped");
  assertEquals(res.orderId, "existing-3");
  assertEquals(ops.length, 0); // no insert / update
});

Deno.test("upsertHotelnabeOrderCore requires hotelnabe_res_id", async () => {
  const { table } = makeFakeTable();
  const payload = buildOrderPayload({
    reservation: makeReservation({ hotelnabeResId: null }),
    accommodationId: ACC,
    roomTypeId: RT,
    packageId: PKG,
  });
  let threw = false;
  try {
    await upsertHotelnabeOrderCore(table, payload);
  } catch {
    threw = true;
  }
  assert(threw);
});

// ─── Regression: real Booking→1886 payload (ResID 5580377069) ──────
// GuaranteeType="None" → must be unpaid + paid_amount=0,
// but final_price MUST preserve the 38400 from the XML (will not be
// zeroed by validate_order_before_insert once 'hotelnabe' is bypassed).
const FIXTURE_REAL_BOOKING_NONE = `<?xml version="1.0" encoding="UTF-8"?><OTA_HotelResNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" xmlns:nabe="http://www.hotelnabe.com.tw/" EchoToken="x" TimeStamp="2026-06-30T20:13:56" Version="1.0"><POS><Source><RequestorID URL="x" Type="18" ID="lakeze" MessagePassword="p"/></Source></POS><HotelReservations><HotelReservation CreateDateTime="2026-06-30T17:51:05" LastModifyDateTime="2026-06-30T17:53:46" ResStatus="Book"><RoomStays><RoomStay><RoomTypes><RoomType><TPA_Extensions><nabe:PMS RoomTypeCode="1063"/></TPA_Extensions></RoomType></RoomTypes><RoomRates><TPA_Extensions><nabe:RoomRate><nabe:PMS RatePlanCode="1001"/></nabe:RoomRate></TPA_Extensions></RoomRates><GuestCounts><GuestCount AgeQualifyingCode="10" Count="2"/></GuestCounts><TimeSpan Start="2026-11-02" End="2026-11-03"/><Total AmountAfterTax="3840000" CurrencyCode="TWD" DecimalPlaces="2"/></RoomStay></RoomStays><ResGlobalInfo><BasicPropertyInfo HotelCode="1886"/><HotelReservationIDs><HotelReservationID ResID_Value="1" ResID_Source="Hotelnabe"/><HotelReservationID ResID_Value="5580377069" ResID_Source="Booking"/></HotelReservationIDs><Total AmountAfterTax="3840000" CurrencyCode="TWD" DecimalPlaces="2"/><DepositPayments><GuaranteePayment GuaranteeType="None"/></DepositPayments></ResGlobalInfo></HotelReservation></HotelReservations></OTA_HotelResNotifRQ>`;

Deno.test("regression: real Booking payload (GuaranteeType=None) → final_price=38400, unpaid", () => {
  const env = parseHotelnabeResNotifRQ(FIXTURE_REAL_BOOKING_NONE);
  assertEquals(env.reservations.length, 1);
  const r = env.reservations[0];
  assertEquals(r.amountAfterTax, 38400);
  assertEquals(r.guaranteeType, "None");

  const p = buildOrderPayload({
    reservation: r,
    accommodationId: ACC,
    roomTypeId: RT,
    packageId: PKG,
  });
  // bypass keeps the XML amount intact
  assertEquals(p.total_price, 38400);
  assertEquals(p.final_price, 38400);
  // GuaranteeType=None → unpaid, paid_amount=0
  assertEquals(p.payment_status, "unpaid");
  assertEquals(p.paid_amount, 0);
});

Deno.test("regression: same payload but GuaranteeType=PrePay → paid + paid_amount=38400", () => {
  const xml = FIXTURE_REAL_BOOKING_NONE.replace(
    `GuaranteeType="None"`,
    `GuaranteeType="PrePay"`,
  );
  const env = parseHotelnabeResNotifRQ(xml);
  const r = env.reservations[0];
  assertEquals(r.guaranteeType, "PrePay");

  const p = buildOrderPayload({
    reservation: r,
    accommodationId: ACC,
    roomTypeId: RT,
    packageId: PKG,
  });
  assertEquals(p.final_price, 38400);
  assertEquals(p.payment_status, "paid");
  assertEquals(p.paid_amount, 38400);
});
