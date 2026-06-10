// 天送專案範本：每房型獨立價格 + 期限相關工具
export const TIANSONG_ACCOMMODATION_ID = "4ee31aca-7e26-4ca6-b7b3-cca57b8b2b32";

export interface RoomOverride {
  room_type_id: string;
  weekday_price: number | null;
  peak_price: number | null;
  weekend_price: number | null;
  available_rooms: number;
}

export interface TemplateLike {
  accommodation_id?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  room_overrides?: any;
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

/**
 * 期限硬性限制：
 *  - 任一檢核日期落在 valid_from..valid_until 範圍外 → 該專案不可用
 *  - 沒設定 valid_from / valid_until 視為無限制
 *  - 沒設定 dates（例：尚未選日期）→ 仍視為可用（讓使用者看到專案存在）
 */
export function isTemplateActiveForDates(
  template: TemplateLike | null | undefined,
  dates: string[] | undefined,
): boolean {
  if (!template) return true;
  if (!dates || dates.length === 0) return true;
  const vf = template.valid_from || null;
  const vu = template.valid_until || null;
  if (!vf && !vu) return true;
  for (const d of dates) {
    if (vf && d < vf) return false;
    if (vu && d > vu) return false;
  }
  return true;
}

export function isTianSong(accommodationId?: string | null): boolean {
  return accommodationId === TIANSONG_ACCOMMODATION_ID;
}
