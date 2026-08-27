/**
 * 預訂管理日曆「包棟內房間組成」（room_types.package_contents，
 * is_exclusive_package = true 且 visible_in_booking_grid = true）子列的顯示規則。
 *
 * 只影響顯示：無任何扣除狀態時該日期格留白；有包棟／包區扣除時沿用既有 🔒remaining/total。
 * 不參與任何庫存計算。
 */
export function compositionCellDisplay(
  hasExclusiveOrder: boolean,
  remaining: number,
  total: number,
): { show: boolean; text: string } {
  if (!hasExclusiveOrder) return { show: false, text: "" };
  return { show: true, text: `${remaining}/${total}` };
}

/**
 * 斜線底紋只沿用上層房型日期格既有鎖房判定（isBlockedByExclusive），
 * 與「是否有扣除」無關。
 */
export function compositionCellStriped(upperBlocked: boolean): boolean {
  return upperBlocked;
}
