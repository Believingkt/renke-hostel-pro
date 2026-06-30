// Pure helpers for building OTA_HotelAvailRS RatePlans from accommodation_packages.
//
// Decision (2026-06): For non-grouped room_types the AvailRS RatePlan source
// switches from `pricing_templates` (sparse — only A1/A2/B1 had templates) to
// `accommodation_packages`. This guarantees A3/A5/A6/A7 (which only have
// packages, no templates) expose RatePlans, and aligns the RatePlanCode
// namespace with `owlting-order-push` (both now use packages.numeric_code).
//
// Group path (owlting_room_type_groups) is unchanged and handled in index.ts.
// A package whose room_types are all consumed by groups will simply not
// contribute any non-grouped RoomStay RatePlans, which is the desired
// behavior (the group emits its own canonical RoomStay + RatePlans).

export interface PackageRow {
  id: string;
  name: string;
  numeric_code: number | null;
  room_type_ids: string[] | null;
  enabled: boolean;
  display_order?: number | null;
}

export interface RatePlanOut {
  code: number;
  name: string;
}

/**
 * Returns the RatePlan list to expose for a given non-grouped room_type.
 * Filters out disabled packages and packages missing numeric_code.
 * Ordered by (display_order asc, numeric_code asc) for deterministic XML.
 */
export function buildRatePlansForRoomType(
  roomTypeId: string,
  packages: PackageRow[],
): RatePlanOut[] {
  const matched = packages.filter(
    (p) =>
      p.enabled &&
      p.numeric_code != null &&
      Array.isArray(p.room_type_ids) &&
      p.room_type_ids.includes(roomTypeId),
  );
  matched.sort((a, b) => {
    const da = a.display_order ?? 0;
    const db = b.display_order ?? 0;
    if (da !== db) return da - db;
    return (a.numeric_code ?? 0) - (b.numeric_code ?? 0);
  });
  return matched.map((p) => ({ code: p.numeric_code as number, name: p.name }));
}
