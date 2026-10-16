// 訂單詳情內嵌編輯：存檔前決定房間明細（order_rooms）要同步、跳過、擋下或先請客服確認
export type SyntheticDecision = "write" | "skip" | null;

export type OrderRoomsSaveAction =
  | { kind: "sync" }
  | { kind: "skip"; reason: "rooms_not_loaded" | "synthetic_skipped" | "no_rooms" }
  | { kind: "block"; reason: "zero_rooms" }
  | { kind: "confirm_synthetic" };

export const isSyntheticRoomId = (id: string) => id.startsWith("synthetic-");

export function decideOrderRoomsSave(input: {
  roomsLoaded: boolean;
  savedRoomCount: number;
  editRoomIds: string[];
  syntheticDecision: SyntheticDecision;
}): OrderRoomsSaveAction {
  const { roomsLoaded, savedRoomCount, editRoomIds, syntheticDecision } = input;
  // 讀取失敗或尚未讀到：不可當成 0 筆，一律不碰 order_rooms
  if (!roomsLoaded) return { kind: "skip", reason: "rooms_not_loaded" };
  if (savedRoomCount > 0 && editRoomIds.length === 0) return { kind: "block", reason: "zero_rooms" };
  if (editRoomIds.length === 0) return { kind: "skip", reason: "no_rooms" };
  // 原本沒有明細、由系統合成的房間：客服確認前不得寫入
  if (savedRoomCount === 0 && editRoomIds.some(isSyntheticRoomId)) {
    if (syntheticDecision === "write") return { kind: "sync" };
    if (syntheticDecision === "skip") return { kind: "skip", reason: "synthetic_skipped" };
    return { kind: "confirm_synthetic" };
  }
  return { kind: "sync" };
}
