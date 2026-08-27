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
 * 斜線底紋沿用「上層包棟房型當日」既有判定，不另建庫存算法：
 *  - upperBlocked：既有鎖房／包區連動鎖房（isBlockedByExclusive）
 *  - upperNoInventory：既有 available === 0
 *  - upperSoldOut：既有 remaining === 0（available - booked）
 * 與「是否有組成扣除數字」完全獨立。
 */
export function compositionCellStriped(
  upperBlocked: boolean,
  upperNoInventory = false,
  upperSoldOut = false,
): boolean {
  return upperBlocked || upperNoInventory || upperSoldOut;
}
