import { supabase } from "@/integrations/supabase/client";

export interface AmenityItem {
  id: string;
  accommodation_id: string;
  name: string;
  unit: string | null;
  total_quantity: number;
  notes: string | null;
  is_active: boolean;
  display_order: number;
}

export interface AmenityAvailability {
  item: AmenityItem;
  /** 期間內任一晚的最高使用量（不含排除的訂單） */
  peakUsed: number;
  /** 期間內可再分配的最大數量 */
  available: number;
}

/** date-only 加減天數（純字串運算，不受 runtime timezone 影響） */
export function addDaysDateOnly(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** 住宿夜次：入住日 ~ 退房前一日（check-in inclusive, check-out exclusive） */
export function toNightRange(checkIn?: string | null, checkOut?: string | null) {
  if (!checkIn || !checkOut) return null;
  const start = checkIn.slice(0, 10);
  const rawEnd = checkOut.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(rawEnd)) return null;
  const end = addDaysDateOnly(rawEnd, -1);
  if (start > end) return null;
  return { start, end };
}


export async function fetchAmenityItems(accommodationId: string): Promise<AmenityItem[]> {
  const { data, error } = await supabase
    .from("amenity_items")
    .select("*")
    .eq("accommodation_id", accommodationId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as AmenityItem[];
}

/**
 * 取得指定期間各備品的可分配數量。
 * peakUsed 取期間內任一晚的最大使用量，確保跨日訂單整段都夠用。
 */
export async function fetchAmenityAvailability(params: {
  accommodationId: string;
  checkIn: string;
  checkOut: string;
  excludeOrderId?: string | null;
  activeOnly?: boolean;
}): Promise<AmenityAvailability[]> {
  const { accommodationId, checkIn, checkOut, excludeOrderId, activeOnly = true } = params;
  const range = toNightRange(checkIn, checkOut);
  const items = await fetchAmenityItems(accommodationId);
  const filtered = activeOnly ? items.filter((i) => i.is_active) : items;
  if (!range) {
    return filtered.map((item) => ({ item, peakUsed: 0, available: item.total_quantity }));
  }

  const { data, error } = await supabase.rpc("get_amenity_daily_usage", {
    p_accommodation_id: accommodationId,
    p_start: range.start,
    p_end: range.end,
    p_exclude_order_id: excludeOrderId ?? null,
  });
  if (error) throw error;

  const peak: Record<string, number> = {};
  (data || []).forEach((row: any) => {
    const key = row.amenity_item_id as string;
    peak[key] = Math.max(peak[key] ?? 0, Number(row.used_qty) || 0);
  });

  return filtered.map((item) => {
    const peakUsed = peak[item.id] ?? 0;
    return { item, peakUsed, available: Math.max(0, item.total_quantity - peakUsed) };
  });
}

export async function fetchOrderAllocations(orderId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("order_amenity_allocations")
    .select("amenity_item_id, quantity")
    .eq("order_id", orderId);
  if (error) throw error;
  const map: Record<string, number> = {};
  (data || []).forEach((row: any) => {
    map[row.amenity_item_id] = row.quantity;
  });
  return map;
}

/** 覆寫訂單的備品分配（0 或未列出者視為移除） */
export async function saveOrderAllocations(params: {
  orderId: string;
  accommodationId: string;
  allocations: Record<string, number>;
}) {
  const { orderId, accommodationId, allocations } = params;
  const entries = Object.entries(allocations).filter(([, qty]) => (qty || 0) > 0);
  const keepIds = entries.map(([id]) => id);

  let deleteQuery = supabase.from("order_amenity_allocations").delete().eq("order_id", orderId);
  if (keepIds.length > 0) {
    deleteQuery = deleteQuery.not("amenity_item_id", "in", `(${keepIds.join(",")})`);
  }
  const { error: delError } = await deleteQuery;
  if (delError) throw delError;

  if (entries.length === 0) return;

  const { error } = await supabase.from("order_amenity_allocations").upsert(
    entries.map(([amenity_item_id, quantity]) => ({
      order_id: orderId,
      amenity_item_id,
      accommodation_id: accommodationId,
      quantity,
    })),
    { onConflict: "order_id,amenity_item_id" },
  );
  if (error) throw error;
}
