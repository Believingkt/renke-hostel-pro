// 點數訂房 0 元防護：報價每晚必須 > 0，且建單觸發器實際會採用的基底價也必須 > 0
export type UnpricedReason = "quote_missing" | "quote_zero" | "stored_price_zero";

export interface BaseRow {
  price: number | null;
  last_change_source: string | null;
}

// 與 validate_order_before_insert 無方案、無專案 id 的分支同規則：
// 基底列來源不是 bulk_open 且 price 不為 null → 用 price；否則用房型 base_price
export function storedNightPrice(row: BaseRow | undefined, roomBasePrice: number | null): number | null {
  const trusted = !!row && (row.last_change_source ?? "") !== "bulk_open";
  if (trusted && row!.price != null) return Number(row!.price);
  return roomBasePrice == null ? null : Number(roomBasePrice);
}

export function findUnpricedNights(
  nights: { date: string; price: number | null }[],
  baseRows: Map<string, BaseRow>,
  roomBasePrice: number | null,
): { date: string; reason: UnpricedReason }[] {
  const out: { date: string; reason: UnpricedReason }[] = [];
  for (const n of nights) {
    if (n.price == null || !Number.isFinite(Number(n.price))) {
      out.push({ date: n.date, reason: "quote_missing" });
    } else if (Number(n.price) <= 0) {
      out.push({ date: n.date, reason: "quote_zero" });
    } else {
      const stored = storedNightPrice(baseRows.get(n.date), roomBasePrice);
      if (stored == null || stored <= 0) out.push({ date: n.date, reason: "stored_price_zero" });
    }
  }
  return out;
}
