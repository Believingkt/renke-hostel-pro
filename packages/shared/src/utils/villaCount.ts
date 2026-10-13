// HQ 營運分析「民宿數量」卡的數字＝包棟數（villa count）：
//   Σ accommodation_info.daily_villa_capacity（僅 is_active = true 的館）
//   daily_villa_capacity 為 null／0，但該館有 is_exclusive_package 房型 → 該館以 1 計
//   都沒有包棟房型的館 → 0
// 不可用房型 room_count 加總（例如哈庫納馬塔塔 6 個包棟方案其實是同一棟）。
export interface VillaCountAccommodation {
  is_active?: boolean | null;
  daily_villa_capacity?: number | null;
  hasExclusiveRoomType?: boolean | null;
}

export function computeVillaCount(accommodations: VillaCountAccommodation[] | null | undefined): number {
  const list = Array.isArray(accommodations) ? accommodations : [];
  return list.reduce((sum, acc) => {
    if (!acc || acc.is_active === false) return sum;
    const cap = Number(acc.daily_villa_capacity);
    if (Number.isFinite(cap) && cap > 0) return sum + Math.round(cap);
    return sum + (acc.hasExclusiveRoomType ? 1 : 0);
  }, 0);
}
