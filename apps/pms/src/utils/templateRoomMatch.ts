/**
 * 統一的「方案 ↔ 房型」對應判斷。
 *
 * pricing_templates 有兩種綁定方式：
 * - room_type_ids (uuid[])：新版多房型綁定，優先採用
 * - room_type_id (uuid)：舊版單一房型綁定
 * 兩者皆為空時視為「全房型通用方案」（例如包棟方案）。
 */
export function templateMatchesRoomType(
  template: { room_type_id?: string | null; room_type_ids?: string[] | null } | null | undefined,
  roomTypeId: string | null | undefined
): boolean {
  if (!template) return false;
  const ids = Array.isArray(template.room_type_ids) ? template.room_type_ids.filter(Boolean) : [];
  const legacyId = template.room_type_id || null;
  // 完全未綁定 → 通用方案
  if (ids.length === 0 && !legacyId) return true;
  if (!roomTypeId) return false;
  if (ids.length > 0 && ids.includes(roomTypeId)) return true;
  return legacyId === roomTypeId;
}
