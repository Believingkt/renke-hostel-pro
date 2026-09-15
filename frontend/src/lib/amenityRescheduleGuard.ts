import {
  fetchOrderAllocations,
  fetchAmenityAvailability,
  type AmenityAvailability,
} from "@/lib/amenityAllocation";

export interface AmenityConflict {
  itemId: string;
  name: string;
  unit: string | null;
  required: number;
  available: number;
}

export type AmenityPrecheckResult =
  | { status: "skipped" }
  | { status: "ok" }
  | { status: "conflict"; conflicts: AmenityConflict[] }
  | { status: "error"; message: string };

/** 純函式：本訂單 allocation vs 新日期（已排除本單）可用量 */
export function computeAmenityConflicts(
  allocations: Record<string, number>,
  availability: AmenityAvailability[],
): AmenityConflict[] {
  const byId = new Map(availability.map((a) => [a.item.id, a]));
  const conflicts: AmenityConflict[] = [];
  for (const [itemId, required] of Object.entries(allocations)) {
    const qty = Number(required) || 0;
    if (qty <= 0) continue;
    const row = byId.get(itemId);
    if (!row) continue; // 找不到（已停用/刪除）→ 交由 DB trigger 最終把關
    if (qty > row.available) {
      conflicts.push({
        itemId,
        name: row.item.name,
        unit: row.item.unit,
        required: qty,
        available: row.available,
      });
    }
  }
  return conflicts;
}

/** 改期前的備品 pre-check（唯讀，重用既有 helper / RPC） */
export async function precheckAmenityReschedule(params: {
  orderId: string;
  accommodationId?: string | null;
  newCheckIn: string;
  newCheckOut: string;
}): Promise<AmenityPrecheckResult> {
  const { orderId, accommodationId, newCheckIn, newCheckOut } = params;
  if (!orderId || !accommodationId) return { status: "skipped" };
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(newCheckIn.slice(0, 10)) || !dateRe.test(newCheckOut.slice(0, 10))) {
    return { status: "skipped" };
  }
  if (newCheckOut.slice(0, 10) <= newCheckIn.slice(0, 10)) return { status: "skipped" };

  try {
    const allocations = await fetchOrderAllocations(orderId);
    const positive = Object.fromEntries(
      Object.entries(allocations).filter(([, q]) => (Number(q) || 0) > 0),
    );
    if (Object.keys(positive).length === 0) return { status: "skipped" };

    const availability = await fetchAmenityAvailability({
      accommodationId,
      checkIn: newCheckIn,
      checkOut: newCheckOut,
      excludeOrderId: orderId,
      activeOnly: false,
    });

    const conflicts = computeAmenityConflicts(positive, availability);
    return conflicts.length > 0 ? { status: "conflict", conflicts } : { status: "ok" };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "unknown" };
  }
}

export interface ParsedAmenityCapacityError {
  name: string;
  date: string;
  total: number;
  demand: number;
}

const AMENITY_ERROR_RE =
  /備品「(.+?)」在\s*(\d{4}-\d{2}-\d{2})\s*已超過可用數量（總數\s*(\d+)\s*，\s*需求\s*(\d+)\s*）/;

/** 可靠辨識 DB amenity capacity trigger 錯誤（不可只靠 SQLSTATE P0001） */
export function parseAmenityCapacityError(
  message?: string | null,
): ParsedAmenityCapacityError | null {
  if (!message) return null;
  if (!message.includes("備品「") || !message.includes("已超過可用數量")) return null;
  const m = message.match(AMENITY_ERROR_RE);
  if (!m) return null;
  return { name: m[1], date: m[2], total: Number(m[3]), demand: Number(m[4]) };
}

/** 只判斷「是否為備品容量錯誤」（wording 判別，寬鬆於完整 parse） */
export function isAmenityCapacityError(message?: string | null): boolean {
  if (!message) return false;
  return message.includes("備品「") && message.includes("已超過可用數量");
}

export interface AmenityRestoreError {
  title: string;
  description: string;
}

/**
 * P2-3B：取消訂單復原（cancelled → 非 cancelled）被 amenity trigger 擋下時的可讀錯誤。
 * 僅在該 status 轉換 + 可靠辨識為備品容量錯誤時回傳，其餘一律 null（維持原本 generic UX）。
 */
export function buildAmenityRestoreError(params: {
  fromStatus?: string | null;
  toStatus?: string | null;
  message?: string | null;
}): AmenityRestoreError | null {
  const { fromStatus, toStatus, message } = params;
  if (fromStatus !== "cancelled" || !toStatus || toStatus === "cancelled") return null;
  if (!isAmenityCapacityError(message)) return null;

  const parsed = parseAmenityCapacityError(message);
  const title = "無法恢復訂單：備品數量不足";
  if (!parsed) {
    return {
      title,
      description:
        "新住宿日期的備品數量不足，因此此訂單尚未恢復。請先調整相關訂單的備品分配，確認數量足夠後再重新恢復訂單。",
    };
  }
  return {
    title,
    description:
      `${parsed.date} 的「${parsed.name}」目前數量不足（總數 ${parsed.total}，目前總需求 ${parsed.demand}），` +
      "因此此訂單尚未恢復。請先調整相關訂單的備品分配，確認數量足夠後再重新恢復訂單。",
  };
}
