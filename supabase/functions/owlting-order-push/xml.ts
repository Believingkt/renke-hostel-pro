// OTA_HotelResNotifRQ XML assembler for OwlTing OwlNest CM
// Wrapped in a SOAP envelope with WS-Security (UsernameToken).
// Pure functions only — no I/O, no Deno-specific APIs, so this file is
// trivially unit-testable.

export type ResStatus = "Commit" | "Modify" | "Cancel";

export interface OwlConfig {
  owlting_hotel_code: string;
}

export interface OwlRoomStayInput {
  roomTypeCode: number;        // room_types.numeric_code
  ratePlanCode: number;        // accommodation_packages.numeric_code
  ratePlanName?: string;
  roomTypeName?: string;
  quantity: number;
  unitAmount: number;          // per-room total for the stay (TWD)
  adults: number;
  children?: number;
}

export interface OwlOrderInput {
  order_number: string;
  check_in_date: string;       // YYYY-MM-DD
  check_out_date: string;      // YYYY-MM-DD
  guest_name: string;
  guest_phone?: string | null;
  guest_email?: string | null;
  total_amount: number;        // final_price (TWD)
  notes?: string | null;
  roomStays: OwlRoomStayInput[];
}

export interface BuildOpts {
  resStatus: ResStatus;
  echoToken: string;
  uniqueId: string;            // = orders.owlting_unique_id
  nowIso?: string;             // override for tests
}

const SOAP_NS = "http://schemas.xmlsoap.org/soap/envelope/";
const WSSE_NS = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const OTA_NS  = "http://www.opentravel.org/OTA/2003/05";
const PASSWORD_TYPE_TEXT =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText";

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function splitName(full: string): { first: string; last: string } {
  const s = (full ?? "").trim();
  if (!s) return { first: "Guest", last: "—" };
  // For CJK names, treat first char as surname; for space-separated, last token = surname.
  if (s.includes(" ")) {
    const parts = s.split(/\s+/);
    const last = parts[parts.length - 1];
    const first = parts.slice(0, -1).join(" ");
    return { first: first || last, last };
  }
  if (s.length >= 2 && /[\u4e00-\u9fff]/.test(s)) {
    return { last: s.slice(0, 1), first: s.slice(1) };
  }
  return { first: s, last: s };
}

function buildPos(): string {
  return `<POS><Source><RequestorID Type="22" ID="LAKEZE"/><BookingChannel Type="7" Primary="true"><CompanyName Code="LAKEZE">人客多 LAKEZE</CompanyName></BookingChannel></Source></POS>`;
}

function buildRoomStay(hotelCode: string, rs: OwlRoomStayInput, checkIn: string, checkOut: string): string {
  return [
    `<RoomStay>`,
      `<RoomTypes><RoomType RoomTypeCode="${esc(rs.roomTypeCode)}"`,
        rs.roomTypeName ? `><RoomDescription Name="${esc(rs.roomTypeName)}"/></RoomType>` : `/>`,
      `</RoomTypes>`,
      `<RatePlans><RatePlan RatePlanCode="${esc(rs.ratePlanCode)}"`,
        rs.ratePlanName ? `><RatePlanDescription Name="${esc(rs.ratePlanName)}"/></RatePlan>` : `/>`,
      `</RatePlans>`,
      `<RoomRates>`,
        `<RoomRate RoomTypeCode="${esc(rs.roomTypeCode)}" RatePlanCode="${esc(rs.ratePlanCode)}" NumberOfUnits="${esc(rs.quantity)}">`,
          `<Rates><Rate><Base AmountAfterTax="${esc(rs.unitAmount)}" CurrencyCode="TWD"/></Rate></Rates>`,
        `</RoomRate>`,
      `</RoomRates>`,
      `<GuestCounts>`,
        `<GuestCount AgeQualifyingCode="10" Count="${esc(rs.adults)}"/>`,
        rs.children && rs.children > 0 ? `<GuestCount AgeQualifyingCode="8" Count="${esc(rs.children)}"/>` : ``,
      `</GuestCounts>`,
      `<TimeSpan Start="${esc(checkIn)}" End="${esc(checkOut)}"/>`,
      `<Total AmountAfterTax="${esc(rs.unitAmount * rs.quantity)}" CurrencyCode="TWD"/>`,
      `<BasicPropertyInfo HotelCode="${esc(hotelCode)}"/>`,
    `</RoomStay>`,
  ].join("");
}

function buildResGuests(order: OwlOrderInput): string {
  const { first, last } = splitName(order.guest_name);
  return [
    `<ResGuests>`,
      `<ResGuest PrimaryIndicator="true" ResGuestRPH="1">`,
        `<Profiles><ProfileInfo><Profile ProfileType="1"><Customer>`,
          `<PersonName><GivenName>${esc(first)}</GivenName><Surname>${esc(last)}</Surname></PersonName>`,
          order.guest_phone ? `<Telephone PhoneNumber="${esc(order.guest_phone)}"/>` : ``,
          order.guest_email ? `<Email>${esc(order.guest_email)}</Email>` : ``,
        `</Customer></Profile></ProfileInfo></Profiles>`,
      `</ResGuest>`,
    `</ResGuests>`,
  ].join("");
}

function buildResGlobalInfo(order: OwlOrderInput, uniqueId: string): string {
  const { first, last } = splitName(order.guest_name);
  return [
    `<ResGlobalInfo>`,
      `<Total AmountAfterTax="${esc(order.total_amount)}" CurrencyCode="TWD"/>`,
      `<HotelReservationIDs>`,
        `<HotelReservationID ResID_Type="14" ResID_Value="${esc(uniqueId)}" ResID_Source="LAKEZE"/>`,
      `</HotelReservationIDs>`,
      `<Profiles><ProfileInfo><Profile ProfileType="1"><Customer>`,
        `<PersonName><GivenName>${esc(first)}</GivenName><Surname>${esc(last)}</Surname></PersonName>`,
        order.guest_phone ? `<Telephone PhoneNumber="${esc(order.guest_phone)}"/>` : ``,
        order.guest_email ? `<Email>${esc(order.guest_email)}</Email>` : ``,
      `</Customer></Profile></ProfileInfo></Profiles>`,
      order.notes ? `<Comments><Comment><Text>${esc(order.notes)}</Text></Comment></Comments>` : ``,
    `</ResGlobalInfo>`,
  ].join("");
}

function buildHotelReservation(
  order: OwlOrderInput,
  config: OwlConfig,
  opts: BuildOpts,
): string {
  const now = opts.nowIso ?? new Date().toISOString();
  const stays = order.roomStays
    .map((rs) => buildRoomStay(config.owlting_hotel_code, rs, order.check_in_date, order.check_out_date))
    .join("");

  // Per OpenTravel + OwlTing convention: CreateDateTime only on Commit;
  // LastModifyDateTime only on Modify/Cancel.
  const dateAttr = opts.resStatus === "Commit"
    ? `CreateDateTime="${now}"`
    : `LastModifyDateTime="${now}"`;

  return [
    `<HotelReservation ${dateAttr} ResStatus="${opts.resStatus}">`,
      `<UniqueID Type="14" ID="${esc(opts.uniqueId)}"/>`,
      `<RoomStays>${stays}</RoomStays>`,
      buildResGuests(order),
      buildResGlobalInfo(order, opts.uniqueId),
    `</HotelReservation>`,
  ].join("");
}

/** Build the inner OTA_HotelResNotifRQ element (no SOAP envelope). */
export function buildResNotifRq(
  order: OwlOrderInput,
  config: OwlConfig,
  opts: BuildOpts,
): string {
  return [
    `<OTA_HotelResNotifRQ xmlns="${OTA_NS}" Version="1.0" EchoToken="${esc(opts.echoToken)}" TimeStamp="${esc(opts.nowIso ?? new Date().toISOString())}" ResStatus="${opts.resStatus}">`,
      buildPos(),
      `<HotelReservations>`,
        buildHotelReservation(order, config, opts),
      `</HotelReservations>`,
    `</OTA_HotelResNotifRQ>`,
  ].join("");
}

/** Build the full SOAP envelope with WS-Security UsernameToken header. */
export function buildResNotifXml(
  order: OwlOrderInput,
  config: OwlConfig,
  opts: BuildOpts,
  credentials: { username: string; password: string },
): string {
  const body = buildResNotifRq(order, config, opts);
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<soap:Envelope xmlns:soap="${SOAP_NS}">`,
      `<soap:Header>`,
        `<wsse:Security xmlns:wsse="${WSSE_NS}" soap:mustUnderstand="1">`,
          `<wsse:UsernameToken>`,
            `<wsse:Username>${esc(credentials.username)}</wsse:Username>`,
            `<wsse:Password Type="${PASSWORD_TYPE_TEXT}">${esc(credentials.password)}</wsse:Password>`,
          `</wsse:UsernameToken>`,
        `</wsse:Security>`,
      `</soap:Header>`,
      `<soap:Body>${body}</soap:Body>`,
    `</soap:Envelope>`,
  ].join("");
}

/** Replace the wsse:Password inner text with a mask. Safe for logging. */
export function maskPasswordInXml(xml: string): string {
  return xml.replace(
    /(<wsse:Password[^>]*>)([\s\S]*?)(<\/wsse:Password>)/,
    `$1********$3`,
  );
}

/**
 * Resolve the RatePlanCode for an order from its package_id.
 * Pure helper — unit-tested.
 *
 * We deliberately do NOT fall back to "the lowest numeric_code package":
 * guessing a rate plan would push wrong data to OwlNest. If the order has
 * no package_id (or it points at a package without numeric_code), the
 * caller must fail the queue row with reason "no rate plan".
 */
export type RatePlanResolution =
  | { ok: true; code: number; name: string; id: string }
  | { ok: false; reason: string };

export function resolveRatePlan(
  packageId: string | null | undefined,
  packages: { id: string; name: string; numeric_code: number | null }[],
): RatePlanResolution {
  if (!packageId) return { ok: false, reason: "no rate plan: order.package_id is null" };
  const pkg = packages.find((p) => p.id === packageId);
  if (!pkg) return { ok: false, reason: `no rate plan: package_id ${packageId} not found for accommodation` };
  if (pkg.numeric_code == null) return { ok: false, reason: `no rate plan: package ${pkg.name} has no numeric_code` };
  return { ok: true, code: pkg.numeric_code, name: pkg.name, id: pkg.id };
}
