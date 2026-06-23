/**
 * Shared/per-property facility merge utilities.
 *
 * Data model:
 * - Shared rows (`accommodation_id IS NULL`, `is_available = true`) act as
 *   default-on templates for every accommodation.
 * - Per-property rows with `is_available = false` are opt-out overrides
 *   ("hide this shared facility for this property").
 * - Per-property rows with `is_available = true` are property-only additions
 *   for facilities that aren't in the shared list.
 */

export type FacilityRowLike = {
  accommodation_id: string | null;
  facility_name: string;
  category: string;
  is_available?: boolean | null;
  pricing_type?: string | null;
};

/**
 * Returns the *effective* per-property facility rows. Shared rows are duplicated
 * (with the target accommodation_id) so callers can keep iterating per-acc.
 *
 * The input rows should include both shared rows AND any per-property rows
 * (including opt-outs with is_available=false) — do NOT pre-filter by
 * `is_available = true` before calling.
 */
export function expandFacilitiesForAccommodations<T extends FacilityRowLike>(
  rows: T[],
  accommodationIds: Iterable<string>,
): T[] {
  const sharedActive: T[] = [];
  const optOut = new Map<string, Set<string>>();
  const propActiveKeys = new Map<string, Set<string>>();
  const propActiveRows: T[] = [];

  for (const r of rows) {
    const key = `${r.facility_name}||${r.category}`;
    if (r.accommodation_id === null) {
      if (r.is_available !== false) sharedActive.push(r);
    } else if (r.is_available === false) {
      const set = optOut.get(r.accommodation_id) ?? new Set<string>();
      set.add(key);
      optOut.set(r.accommodation_id, set);
    } else {
      const set = propActiveKeys.get(r.accommodation_id) ?? new Set<string>();
      set.add(key);
      propActiveKeys.set(r.accommodation_id, set);
      propActiveRows.push(r);
    }
  }

  const result: T[] = [...propActiveRows];
  for (const accId of accommodationIds) {
    const opts = optOut.get(accId) ?? new Set<string>();
    const own = propActiveKeys.get(accId) ?? new Set<string>();
    for (const s of sharedActive) {
      const key = `${s.facility_name}||${s.category}`;
      if (opts.has(key) || own.has(key)) continue;
      result.push({ ...s, accommodation_id: accId });
    }
  }
  return result;
}
