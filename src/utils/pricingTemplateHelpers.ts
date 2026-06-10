// 天送專案範本：每房型獨立價格 + 期限相關工具
export const TIANSONG_ACCOMMODATION_ID = "4ee31aca-5641-4d05-80e2-1c67626be83d";

export type DayTier = "weekday" | "peak" | "weekend";

export interface RoomOverride {
  room_type_id: string;
  weekday_price: number | null;
  peak_price: number | null;
  weekend_price: number | null;
  available_rooms: number;
  weekday_enabled?: boolean;
  peak_enabled?: boolean;
  weekend_enabled?: boolean;
}

export interface SeasonSegment {
  id?: string;
  label?: string | null;
  valid_from: string;  // YYYY-MM-DD
  valid_until: string; // YYYY-MM-DD
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
  room_overrides?: any;
  weekday_enabled?: boolean | null;
  peak_enabled?: boolean | null;
  weekend_enabled?: boolean | null;
  weekday_price?: number | null;
  peak_price?: number | null;
  weekend_price?: number | null;
  price?: number | null;
  extra_dates?: any;
  excluded_dates?: any;
  season_segments?: any;
}

export function getRoomOverrides(template: TemplateLike | null | undefined): RoomOverride[] {
  if (!template) return [];
  const raw = (template as any).room_overrides;
  if (!Array.isArray(raw)) return [];
  return raw.filter((r) => r && r.room_type_id);
}

export function getRoomOverride(
  template: TemplateLike | null | undefined,
  roomTypeId: string,
): RoomOverride | null {
  return getRoomOverrides(template).find((r) => r.room_type_id === roomTypeId) || null;
}

function asDateStringArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d));
}

export function getExtraDates(template: TemplateLike | null | undefined): string[] {
  return asDateStringArray(template?.extra_dates);
}

export function getExcludedDates(template: TemplateLike | null | undefined): string[] {
  return asDateStringArray(template?.excluded_dates);
}

// ---------- Season segments ----------

export function getSegments(template: TemplateLike | null | undefined): SeasonSegment[] {
  if (!template) return [];
  const raw = (template as any).season_segments;
  if (!Array.isArray(raw)) return [];
  return raw.filter((s) => s && typeof s.valid_from === "string" && typeof s.valid_until === "string");
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

/**
 * 期限硬性限制：
 *  - 有 season_segments → 每個檢核日期都必須能對應到某個 segment（且不在該段 excluded_dates）
 *  - 無 segments → 使用頂層 valid_from/until + extra/excluded（原邏輯）
 */
export function isTemplateActiveForDates(
  template: TemplateLike | null | undefined,
  dates: string[] | undefined,
): boolean {
  if (!template) return true;
  if (!dates || dates.length === 0) return true;

  if (hasSegments(template)) {
    for (const d of dates) {
      if (!findSegmentForDate(template, d)) return false;
    }
    return true;
  }

  const vf = template.valid_from || null;
  const vu = template.valid_until || null;
  const extra = new Set(getExtraDates(template));
  const excluded = new Set(getExcludedDates(template));
  for (const d of dates) {
    if (excluded.has(d)) return false;
    if (extra.has(d)) continue;
    if (!vf && !vu) continue;
    if (vf && d < vf) return false;
    if (vu && d > vu) return false;
  }
  return true;
}

/** 房型 override 的「平日/旺日/假日」開關，預設 true（未設定欄位視為開啟）。 */
export function isOverrideTierEnabled(
  override: RoomOverride | null | undefined,
  tier: DayTier,
): boolean {
  if (!override) return true;
  const key =
    tier === "weekday" ? "weekday_enabled" :
    tier === "peak" ? "peak_enabled" : "weekend_enabled";
  const v = (override as any)[key];
  return v !== false;
}

/** 範本層級的「平日/旺日/假日」開關，預設 true。 */
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

/**
 * 取得「某日期」該房型的有效 room_override：
 *  - 有 segments 且該日落在某 segment：回該 segment 的 room_override
 *  - 否則回頂層 room_overrides
 */
export function getRoomOverrideForDate(
  template: TemplateLike | null | undefined,
  roomTypeId: string | null | undefined,
  dateStr: string,
): RoomOverride | null {
  if (!template || !roomTypeId) return null;
  if (hasSegments(template)) {
    const seg = findSegmentForDate(template, dateStr);
    if (seg && Array.isArray(seg.room_overrides)) {
      return seg.room_overrides.find((r) => r && r.room_type_id === roomTypeId) || null;
    }
    return null;
  }
  return getRoomOverride(template, roomTypeId);
}

/**
 * 取得「某日期 + 某 tier」的有效 tier 開關與價格：
 *  - segments 模式：以該日所屬 segment 的 (room_override > segment) 為準
 *  - 非 segments：以 (room_override > template 頂層) 為準
 */
export function getTierForDate(
  template: TemplateLike | null | undefined,
  roomTypeId: string | null | undefined,
  dateStr: string,
  tier: DayTier,
): { enabled: boolean; price: number | null } {
  if (!template) return { enabled: true, price: null };

  const tierKey = tier === "weekday" ? "weekday_price" : tier === "peak" ? "peak_price" : "weekend_price";
  const enKey = tier === "weekday" ? "weekday_enabled" : tier === "peak" ? "peak_enabled" : "weekend_enabled";

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
    const price = ov?.[tierKey as keyof RoomOverride] as number | null | undefined
      ?? (seg as any)[tierKey] ?? null;
    return { enabled, price: typeof price === "number" ? price : null };
  }

  // legacy
  const ov = roomTypeId ? getRoomOverride(template, roomTypeId) : null;
  let enabled = isTemplateTierEnabled(template, tier);
  if (ov && (ov as any)[enKey] !== undefined) {
    enabled = (ov as any)[enKey] !== false;
  }
  const price = (ov?.[tierKey as keyof RoomOverride] as number | null | undefined)
    ?? (template as any)[tierKey] ?? null;
  return { enabled, price: typeof price === "number" ? price : null };
}

/**
 * 房型 + 範本最終是否允許「在某日型販售」：
 *  - 房型 override 若有 enable 欄位，以該房型為準
 *  - 否則回退到範本層級開關
 *  - segments 模式：須先傳入 dateStr；未傳入 dateStr 時走頂層開關（保持向後相容呼叫者）
 */
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

export function isTianSong(accommodationId?: string | null): boolean {
  return accommodationId === TIANSONG_ACCOMMODATION_ID;
}
