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

export interface TemplateLike {
  accommodation_id?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  room_overrides?: any;
  weekday_enabled?: boolean | null;
  peak_enabled?: boolean | null;
  weekend_enabled?: boolean | null;
  extra_dates?: any;
  excluded_dates?: any;
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

/**
 * 期限硬性限制：
 *  - 任一檢核日期落在 valid_from..valid_until 範圍外 → 該專案不可用
 *    （除非該日在 extra_dates 內，視為例外加入）
 *  - 任一檢核日期在 excluded_dates 內 → 該專案不可用
 *  - 沒設定 valid_from / valid_until 視為無限制
 *  - 沒設定 dates（例：尚未選日期）→ 仍視為可用
 */
export function isTemplateActiveForDates(
  template: TemplateLike | null | undefined,
  dates: string[] | undefined,
): boolean {
  if (!template) return true;
  if (!dates || dates.length === 0) return true;
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
 * 房型 + 範本最終是否允許「在某日型販售」：
 *  - 房型 override 若有 enable 欄位，以該房型為準
 *  - 否則回退到範本層級開關
 */
export function isTierSellable(
  template: TemplateLike | null | undefined,
  roomTypeId: string | null | undefined,
  tier: DayTier,
): boolean {
  if (!template) return true;
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
