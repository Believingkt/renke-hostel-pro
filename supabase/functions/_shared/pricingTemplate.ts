// Edge-function port of src/utils/pricingTemplateHelpers.ts (one-to-one aligned).
// Pure functions, no DB, no @/ alias — safe to import from Deno edge functions.
// Keep behaviour identical to the frontend helper so availability API prices
// match front-end / points-booking-api calculations.

export type DayTier = "weekday" | "peak" | "weekend";

export interface RoomOverride {
  room_type_id: string;
  weekday_price: number | null;
  peak_price: number | null;
  weekend_price: number | null;
  available_rooms?: number;
  weekday_enabled?: boolean;
  peak_enabled?: boolean;
  weekend_enabled?: boolean;
}

export interface SeasonSegment {
  id?: string;
  label?: string | null;
  valid_from: string;
  valid_until: string;
  weekday_price?: number | null;
  peak_price?: number | null;
  weekend_price?: number | null;
  weekday_enabled?: boolean;
  peak_enabled?: boolean;
  weekend_enabled?: boolean;
  extra_dates?: string[];
  excluded_dates?: string[];
  room_overrides?: RoomOverride[];
}

export interface TemplateLike {
  accommodation_id?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  room_overrides?: unknown;
  weekday_enabled?: boolean | null;
  peak_enabled?: boolean | null;
  weekend_enabled?: boolean | null;
  weekday_price?: number | null;
  peak_price?: number | null;
  weekend_price?: number | null;
  price?: number | null;
  extra_dates?: unknown;
  excluded_dates?: unknown;
  season_segments?: unknown;
}

export function getRoomOverrides(template: TemplateLike | null | undefined): RoomOverride[] {
  if (!template) return [];
  const raw = (template as any).room_overrides;
  if (!Array.isArray(raw)) return [];
  return raw.filter((r: any) => r && r.room_type_id);
}

export function getRoomOverride(
  template: TemplateLike | null | undefined,
  roomTypeId: string,
): RoomOverride | null {
  return getRoomOverrides(template).find((r) => r.room_type_id === roomTypeId) || null;
}

function asDateStringArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((d: any) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d));
}

export function getSegments(template: TemplateLike | null | undefined): SeasonSegment[] {
  if (!template) return [];
  const raw = (template as any).season_segments;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s: any) => s && typeof s.valid_from === "string" && typeof s.valid_until === "string",
  );
}

export function hasSegments(template: TemplateLike | null | undefined): boolean {
  return getSegments(template).length > 0;
}

export function findSegmentForDate(
  template: TemplateLike | null | undefined,
  dateStr: string,
): SeasonSegment | null {
  const segments = getSegments(template);
  for (const seg of segments) {
    const excluded = asDateStringArray(seg.excluded_dates);
    if (excluded.includes(dateStr)) continue;
    const extra = asDateStringArray(seg.extra_dates);
    if (extra.includes(dateStr)) return seg;
    if (dateStr >= seg.valid_from && dateStr <= seg.valid_until) return seg;
  }
  return null;
}

export function isTemplateTierEnabled(
  template: TemplateLike | null | undefined,
  tier: DayTier,
): boolean {
  if (!template) return true;
  const key =
    tier === "weekday" ? "weekday_enabled" :
    tier === "peak" ? "peak_enabled" : "weekend_enabled";
  const v = (template as any)[key];
  return v !== false;
}

/** 一比一對齊前端 getTierForDate。 */
export function getTierForDate(
  template: TemplateLike | null | undefined,
  roomTypeId: string | null | undefined,
  dateStr: string,
  tier: DayTier,
): { enabled: boolean; price: number | null } {
  if (!template) return { enabled: true, price: null };

  const tierKey =
    tier === "weekday" ? "weekday_price" : tier === "peak" ? "peak_price" : "weekend_price";
  const enKey =
    tier === "weekday" ? "weekday_enabled" : tier === "peak" ? "peak_enabled" : "weekend_enabled";

  if (hasSegments(template)) {
    const seg = findSegmentForDate(template, dateStr);
    if (!seg) return { enabled: false, price: null };

    const ov = roomTypeId && Array.isArray(seg.room_overrides)
      ? seg.room_overrides.find((r) => r && r.room_type_id === roomTypeId) || null
      : null;

    let enabled = (seg as any)[enKey] !== false;
    if (ov && (ov as any)[enKey] !== undefined) {
      enabled = (ov as any)[enKey] !== false;
    }
    const price = (ov?.[tierKey as keyof RoomOverride] as number | null | undefined)
      ?? (seg as any)[tierKey] ?? null;
    return { enabled, price: typeof price === "number" ? price : null };
  }

  const ov = roomTypeId ? getRoomOverride(template, roomTypeId) : null;
  let enabled = isTemplateTierEnabled(template, tier);
  if (ov && (ov as any)[enKey] !== undefined) {
    enabled = (ov as any)[enKey] !== false;
  }
  const price = (ov?.[tierKey as keyof RoomOverride] as number | null | undefined)
    ?? (template as any)[tierKey] ?? null;
  return { enabled, price: typeof price === "number" ? price : null };
}

export function isTierSellable(
  template: TemplateLike | null | undefined,
  roomTypeId: string | null | undefined,
  tier: DayTier,
  dateStr?: string,
): boolean {
  if (!template) return true;
  if (hasSegments(template) && dateStr) {
    return getTierForDate(template, roomTypeId, dateStr, tier).enabled;
  }
  const ov = roomTypeId ? getRoomOverride(template, roomTypeId) : null;
  if (ov) {
    const key =
      tier === "weekday" ? "weekday_enabled" :
      tier === "peak" ? "peak_enabled" : "weekend_enabled";
    if ((ov as any)[key] !== undefined) {
      return (ov as any)[key] !== false;
    }
  }
  return isTemplateTierEnabled(template, tier);
}
