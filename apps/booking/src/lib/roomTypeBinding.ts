export const ALL_ROOMS_CONFIRM_TEXT = "原本綁定的房型已刪除，請重新選擇房型；若要適用所有房型請確認";

export function splitRoomTypeIds(ids: readonly string[] | null | undefined, existing: readonly { id: string }[]) {
  const set = new Set(existing.map((r) => r.id));
  const list = Array.isArray(ids) ? ids : [];
  return {
    valid: list.filter((id) => set.has(id)),
    removed: list.filter((id) => !set.has(id)),
  };
}

// 原本綁的房型有被刪除、且最後一個房型都沒選 → 存成空陣列（＝所有房型可用）前要使用者明確確認
export function needsAllRoomsConfirm(
  originalIds: readonly string[] | null | undefined,
  finalIds: readonly string[],
  existing: readonly { id: string }[],
): boolean {
  return splitRoomTypeIds(originalIds, existing).removed.length > 0 && finalIds.length === 0;
}
