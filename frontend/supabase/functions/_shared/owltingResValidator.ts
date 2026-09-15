/**
 * owltingResValidator
 *
 * Outbound OTA_HotelResNotifRQ XML structural validator.
 *
 * Per OwlTing requirement, ALL three ResStatus values (Commit / Modify / Cancel)
 * MUST carry a full reservation body. Cancel cannot be a UniqueID-only payload —
 * OwlTing needs full body to cross-verify, release inventory, and snapshot the
 * cancellation. This validator MUST be called by every outbound generator
 * (self-test, future webhook fanout, etc.) before the XML is dispatched.
 *
 * Validation is lightweight regex-based — sufficient for catching missing-block
 * mistakes during development. It is not a full XSD validator; the receiving
 * server is the source of truth for semantic correctness.
 */

export type ResStatus = "Commit" | "Modify" | "Cancel";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const REQUIRED_BLOCKS: Array<{ tag: string; label: string }> = [
  { tag: "RoomStays", label: "<RoomStays>" },
  { tag: "RoomStay", label: "<RoomStay>" },
  { tag: "RoomTypes", label: "<RoomTypes>" },
  { tag: "RatePlans", label: "<RatePlans>" },
  { tag: "RoomRates", label: "<RoomRates>" },
  { tag: "GuestCounts", label: "<GuestCounts>" },
  { tag: "TimeSpan", label: "<TimeSpan>" },
  { tag: "ResGuests", label: "<ResGuests>" },
  { tag: "ResGuest", label: "<ResGuest>" },
  { tag: "ResGlobalInfo", label: "<ResGlobalInfo>" },
  { tag: "HotelReservationIDs", label: "<HotelReservationIDs>" },
];

function hasTag(xml: string, tag: string): boolean {
  // Match either <Tag ...> or <Tag>; ignore self-closing for container tags
  const re = new RegExp(`<${tag}\\b[^>]*>`);
  return re.test(xml);
}

function extractFirstHotelReservation(xml: string): string | null {
  const m = /<HotelReservation\b[\s\S]*?<\/HotelReservation>/.exec(xml);
  return m ? m[0] : null;
}

/**
 * Validate an outbound OTA_HotelResNotifRQ XML payload (full envelope or
 * <OTA_HotelResNotifRQ> fragment). Throws nothing — returns structured result.
 *
 * Rules enforced for ALL ResStatus values (Commit / Modify / Cancel):
 *   - Exactly one <HotelReservation> with ResStatus attribute
 *   - <UniqueID> present
 *   - Required body blocks: RoomStays > RoomStay (with RoomTypes / RatePlans /
 *     RoomRates / GuestCounts / TimeSpan), ResGuests > ResGuest, ResGlobalInfo
 *     with HotelReservationIDs
 *   - <HotelReservation> carries CreateDateTime (Commit) or LastModifyDateTime
 *     (Modify / Cancel)
 */
export function validateOutboundResNotifXml(xml: string): ValidationResult {
  const errors: string[] = [];

  if (!xml || typeof xml !== "string") {
    return { ok: false, errors: ["XML payload is empty"] };
  }

  if (!/<OTA_HotelResNotifRQ\b/.test(xml)) {
    errors.push("Missing <OTA_HotelResNotifRQ> root element");
  }

  const reservation = extractFirstHotelReservation(xml);
  if (!reservation) {
    errors.push("Missing <HotelReservation> block");
    return { ok: false, errors };
  }

  // ResStatus attribute on <HotelReservation>
  const resStatusMatch = /<HotelReservation\b[^>]*\bResStatus="(Commit|Modify|Cancel)"/.exec(
    reservation,
  );
  if (!resStatusMatch) {
    errors.push(
      '<HotelReservation> must carry ResStatus="Commit|Modify|Cancel"',
    );
  }
  const resStatus = (resStatusMatch?.[1] ?? null) as ResStatus | null;

  // Timestamp attribute matches ResStatus
  if (resStatus === "Commit") {
    if (!/<HotelReservation\b[^>]*\bCreateDateTime="/.test(reservation)) {
      errors.push("Commit reservation missing CreateDateTime attribute");
    }
  } else if (resStatus === "Modify" || resStatus === "Cancel") {
    if (!/<HotelReservation\b[^>]*\bLastModifyDateTime="/.test(reservation)) {
      errors.push(
        `${resStatus} reservation missing LastModifyDateTime attribute`,
      );
    }
  }

  // UniqueID
  if (!/<UniqueID\b[^>]*\bID="[^"]+"/.test(reservation)) {
    errors.push("Missing or empty <UniqueID> ID attribute");
  }

  // Required nested blocks (apply to ALL ResStatus, including Cancel)
  for (const { tag, label } of REQUIRED_BLOCKS) {
    if (!hasTag(reservation, tag)) {
      errors.push(`Missing required block ${label}`);
    }
  }

  // Spot-check: at least one <Rate ... EffectiveDate ... ExpireDate>
  if (!/<Rate\b[^>]*\bEffectiveDate="[^"]+"[^>]*\bExpireDate="[^"]+"/.test(reservation)) {
    errors.push("Missing <Rate EffectiveDate ExpireDate> inside <RoomRates>");
  }

  // Spot-check: ResGuest carries Profiles > ProfileInfo > Profile > Customer
  if (!/<ResGuest\b[\s\S]*?<Customer\b[\s\S]*?<\/ResGuest>/.test(reservation)) {
    errors.push("<ResGuest> missing nested <Customer> profile");
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Convenience wrapper that throws when validation fails. Use this in outbound
 * generators where a malformed payload should hard-stop the dispatch path.
 */
export function assertValidOutboundResNotifXml(xml: string): void {
  const r = validateOutboundResNotifXml(xml);
  if (!r.ok) {
    throw new Error(
      `Invalid outbound OTA_HotelResNotifRQ XML — refusing to dispatch:\n  - ${r.errors.join("\n  - ")}`,
    );
  }
}
