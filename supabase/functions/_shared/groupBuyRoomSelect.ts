// 團購候選房型分配：capacity 與庫存必須「同時」成立才可指派。
// 純邏輯（庫存查詢以 callback 注入），前後端／測試共用同一套順序規則。

export interface RoomTypeCandidate {
  id: string;
  /** room_types.capacity；<= 0 視為未設限 */
  capacity: number;
}

export type RoomSelectFailure = "capacity" | "inventory" | "both";

export interface RoomSelectResult {
  roomTypeId: string | null;
  failure?: RoomSelectFailure;
}

export const ROOM_SELECT_MESSAGES: Record<RoomSelectFailure, string> = {
  capacity: "目前可用房型無法容納此入住人數，請調整入住人數。",
  inventory: "預訂失敗：此區間目前無足夠空房",
  both: "目前沒有符合此入住人數與日期的可用房型。",
};

export function fitsCapacity(candidate: RoomTypeCandidate, capacityHeadcount: number): boolean {
  return candidate.capacity <= 0 || capacityHeadcount <= candidate.capacity;
}

/**
 * 依候選順序逐一檢查：先容量、再庫存；兩者皆足夠才選定。
 */
export async function selectRoomType(
  candidates: RoomTypeCandidate[],
  capacityHeadcount: number,
  hasInventory: (roomTypeId: string) => Promise<boolean>,
): Promise<RoomSelectResult> {
  let capacityFail = false;
  let inventoryFail = false;

  for (const candidate of candidates) {
    if (!fitsCapacity(candidate, capacityHeadcount)) {
      capacityFail = true;
      continue;
    }
    if (await hasInventory(candidate.id)) {
      return { roomTypeId: candidate.id };
    }
    inventoryFail = true;
  }

  const failure: RoomSelectFailure =
    capacityFail && inventoryFail ? "both" : capacityFail ? "capacity" : "inventory";
  return { roomTypeId: null, failure };
}
