import { supabase } from "@/integrations/supabase/client";

export interface RoomPriceRange {
  low: number;
  high: number;
}

const HORIZON_DAYS = 180;

const toDateString = (d: Date) => d.toISOString().split("T")[0];

const positive = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const pushPrice = (map: Map<string, number[]>, roomTypeId: string, price: number) => {
  const arr = map.get(roomTypeId);
  if (arr) arr.push(price);
  else map.set(roomTypeId, [price]);
};

const toRanges = (map: Map<string, number[]>): Record<string, RoomPriceRange> => {
  const out: Record<string, RoomPriceRange> = {};
  map.forEach((prices, roomTypeId) => {
    if (prices.length === 0) return;
    out[roomTypeId] = { low: Math.min(...prices), high: Math.max(...prices) };
  });
  return out;
};

/**
 * 取得各房型的實際售價區間，供結構化資料（Product / AggregateOffer）使用。
 * 優先採用未來 180 天的每日房價；房型沒有每日房價時，改用對應方案的售價。
 * 純唯讀查詢，失敗時回傳空物件（呼叫端自行退回 base_price）。
 */
export async function fetchRoomPriceRanges(
  accommodationId: string | null | undefined,
  roomTypeIds: string[]
): Promise<Record<string, RoomPriceRange>> {
  if (!accommodationId || roomTypeIds.length === 0) return {};

  const today = new Date();
  const until = new Date(today.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000);

  // 逐房型查詢，避免多房型合併查詢被單次回傳筆數上限截斷
  const [dailyResults, packagesRes] = await Promise.all([
    Promise.all(
      roomTypeIds.map((roomTypeId) =>
        supabase
          .from("room_inventory_pricing")
          .select("room_type_id, price, is_available, date")
          .eq("room_type_id", roomTypeId)
          .gte("date", toDateString(today))
          .lte("date", toDateString(until))
      )
    ),
    supabase
      .from("accommodation_packages")
      .select(
        "id, sale_price, tier_prices, primary_room_type_id, room_type_ids, room_type_allocation, enabled"
      )
      .eq("accommodation_id", accommodationId)
      .eq("enabled", true),
  ]);

  // 先取「可售日」的房價；某些房型未來全部關房（例如僅開放包棟），
  // 此時退而採用所有有效房價，避免結構化資料完全沒有價格。
  const dailyMap = new Map<string, number[]>();
  const dailyMapAny = new Map<string, number[]>();
  for (const row of dailyRes.data ?? []) {
    const price = positive(row.price);
    if (price === undefined) continue;
    const roomTypeId = row.room_type_id as string;
    pushPrice(dailyMapAny, roomTypeId, price);
    if (row.is_available === false) continue;
    pushPrice(dailyMap, roomTypeId, price);
  }

  const packageMap = new Map<string, number[]>();
  for (const pkg of (packagesRes.data ?? []) as Array<Record<string, unknown>>) {
    const prices: number[] = [];
    const base = positive(pkg.sale_price);
    if (base !== undefined) prices.push(base);
    const tierPrices = pkg.tier_prices as Record<string, { sale?: unknown }> | null;
    if (tierPrices && typeof tierPrices === "object") {
      for (const entry of Object.values(tierPrices)) {
        const p = positive(entry?.sale);
        if (p !== undefined) prices.push(p);
      }
    }
    if (prices.length === 0) continue;

    const targets = new Set<string>();
    if (typeof pkg.primary_room_type_id === "string") targets.add(pkg.primary_room_type_id);
    if (Array.isArray(pkg.room_type_ids)) {
      for (const id of pkg.room_type_ids) if (typeof id === "string") targets.add(id);
    }
    if (Array.isArray(pkg.room_type_allocation)) {
      for (const item of pkg.room_type_allocation as Array<{ room_type_id?: unknown }>) {
        if (item && typeof item.room_type_id === "string") targets.add(item.room_type_id);
      }
    }

    for (const roomTypeId of targets) {
      if (!roomTypeIds.includes(roomTypeId)) continue;
      for (const p of prices) pushPrice(packageMap, roomTypeId, p);
    }
  }

  const dailyRanges = toRanges(dailyMap);
  const dailyRangesAny = toRanges(dailyMapAny);
  const packageRanges = toRanges(packageMap);

  const result: Record<string, RoomPriceRange> = {};
  for (const roomTypeId of roomTypeIds) {
    // 每日房價優先；沒有每日房價的房型（例如包區）改用方案售價
    const range =
      dailyRanges[roomTypeId] ?? packageRanges[roomTypeId] ?? dailyRangesAny[roomTypeId];
    if (range) result[roomTypeId] = range;
  }
  return result;
}
