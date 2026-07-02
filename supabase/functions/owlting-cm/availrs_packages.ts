// Pure helpers for building OTA_HotelAvailRS RatePlans from accommodation_packages
// (with pricing_templates → default_package_id fallback).
//
// Decision (2026-07 regression fix): For non-grouped room_types the RatePlan
// source is the UNION of two paths, deduped by package.id:
//
//   (a) accommodation_packages whose `room_type_ids` includes this room_type
//       (covers 雲岫: A1-A7 each mapped to 5-6 packages via room_type_ids).
//   (b) pricing_templates whose `room_type_id` == this room_type, resolved via
//       `template.default_package_id` → accommodation_packages
//       (covers SENSAN 散客房 雙人房/四人房 — 一泊一食 templates → package).
//
// RatePlanCode is ALWAYS the resolved accommodation_packages.numeric_code so
// AvailRS-published codes match owlting-order-push (order.package_id →
// package.numeric_code). We never fall back to template.numeric_code — that
// would break order push. Templates without default_package_id are reported
// as data gaps via `findTemplateMappingGaps`; the affected room stays empty.
//
// Group path (owlting_room_type_groups) is unchanged and handled in index.ts.

export interface PackageRow {
  id: string;
  name: string;
  numeric_code: number | null;
  room_type_ids: string[] | null;
  enabled: boolean;
  display_order?: number | null;
}

export interface TemplateRow {
  id: string;
  template_name?: string | null;
  room_type_id: string | null;
  default_package_id: string | null;
}

export interface RatePlanOut {
  code: number;
  name: string;
}

export interface TemplateMappingGap {
  templateId: string;
  templateName: string;
  roomTypeId: string;
}

/**
 * Returns the RatePlan list to expose for a given non-grouped room_type.
 * UNION of (a) packages containing this room_type in room_type_ids AND
 * (b) templates for this room_type mapped through default_package_id.
 * Deduped by package.id, ordered by (display_order asc, numeric_code asc).
 * Packages that are disabled / missing numeric_code are filtered.
 * Templates lacking default_package_id are silently skipped here (use
 * `findTemplateMappingGaps` to surface them separately).
 */
export function buildRatePlansForRoomType(
  roomTypeId: string,
  packages: PackageRow[],
  templates: TemplateRow[] = [],
): RatePlanOut[] {
  const pkgById = new Map<string, PackageRow>(packages.map((p) => [p.id, p]));
  const included = new Map<string, PackageRow>();

  // (a) Packages whose room_type_ids includes this room.
  for (const p of packages) {
    if (!p.enabled || p.numeric_code == null) continue;
    if (Array.isArray(p.room_type_ids) && p.room_type_ids.includes(roomTypeId)) {
      included.set(p.id, p);
    }
  }

  // (b) Templates for this room_type → default_package_id → package.
  for (const t of templates) {
    if (t.room_type_id !== roomTypeId) continue;
    if (!t.default_package_id) continue; // data gap; reported by findTemplateMappingGaps
    const p = pkgById.get(t.default_package_id);
    if (!p || !p.enabled || p.numeric_code == null) continue;
    included.set(p.id, p);
  }

  const arr = Array.from(included.values());
  arr.sort((a, b) => {
    const da = a.display_order ?? 0;
    const db = b.display_order ?? 0;
    if (da !== db) return da - db;
    return (a.numeric_code ?? 0) - (b.numeric_code ?? 0);
  });
  return arr.map((p) => ({ code: p.numeric_code as number, name: p.name }));
}

/**
 * List templates that lack `default_package_id` (or point at a missing/disabled
 * package). These are data gaps: the corresponding room_type may end up with
 * fewer RatePlans (or empty) in AvailRS until someone sets the mapping in the
 * 「方案對應」 UI. Group-member room_types should be filtered out by the caller.
 */
export function findTemplateMappingGaps(
  templates: TemplateRow[],
  packages: PackageRow[] = [],
): TemplateMappingGap[] {
  const pkgById = new Map<string, PackageRow>(packages.map((p) => [p.id, p]));
  const gaps: TemplateMappingGap[] = [];
  for (const t of templates) {
    if (!t.room_type_id) continue;
    if (!t.default_package_id) {
      gaps.push({
        templateId: t.id,
        templateName: t.template_name ?? "(unnamed)",
        roomTypeId: t.room_type_id,
      });
      continue;
    }
    const p = pkgById.get(t.default_package_id);
    if (!p || !p.enabled || p.numeric_code == null) {
      gaps.push({
        templateId: t.id,
        templateName: t.template_name ?? "(unnamed)",
        roomTypeId: t.room_type_id,
      });
    }
  }
  return gaps;
}
