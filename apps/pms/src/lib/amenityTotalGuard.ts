/**
 * P2-2A｜備品總數調降 Frontend Pre-check（純邏輯 + read-only 查詢）
 *
 * 產品規則：
 * - 只有在「降低」total_quantity 時才擋。
 * - 新總數不得低於「今天（Asia/Taipei）＋未來住宿夜」中，該備品的最高每日已分配量。
 * - 有效 allocation 語意完全沿用 get_amenity_daily_usage：order_status <> 'cancelled'，
 *   住宿夜 = check_in_date（含）～ check_out_date - 1（含）。
 * - 歷史住宿夜不阻擋降量。
 *
 * 注意：這是 Frontend UX Guard，不是 atomic DB protection。
 * T1 讀 peak → T2 他人新增 allocation → T3 update total 仍可能 race，
 * 真正的 atomic 保護留待 P2-2B（amenity_items BEFORE UPDATE trigger）。
 */
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { addDaysDateOnly } from "@/lib/amenityAllocation";
import { taipeiToday } from "@lakeze/shared/lib/taipeiToday";

export type AmenityPeakStatus = "idle" | "loading" | "ready" | "error";

export interface AmenityFuturePeak {
  status: AmenityPeakStatus;
  /** 今天以後（含今天）任一住宿夜的最高已分配量 */
  peak: number;
  /** 造成 peak 的日期（YYYY-MM-DD），peak = 0 時為 null */
  peakDate: string | null;
}

export const IDLE_PEAK: AmenityFuturePeak = { status: "idle", peak: 0, peakDate: null };
export const LOADING_PEAK: AmenityFuturePeak = { status: "loading", peak: 0, peakDate: null };
export const ERROR_PEAK: AmenityFuturePeak = { status: "error", peak: 0, peakDate: null };

export interface UsageRow {
  amenity_item_id: string;
  usage_date: string;
  used_qty: number | string | null;
}

/** 從 get_amenity_daily_usage 的結果取某備品「今天以後」的 peak 與日期 */
export function extractFuturePeak(
  rows: UsageRow[] | null | undefined,
  amenityItemId: string,
  today: string,
): { peak: number; peakDate: string | null } {
  let peak = 0;
  let peakDate: string | null = null;
  (rows || []).forEach((row) => {
    if (row.amenity_item_id !== amenityItemId) return;
    const day = String(row.usage_date || "").slice(0, 10);
    if (!day || day < today) return;
    const qty = Number(row.used_qty) || 0;
    if (qty > peak || (qty === peak && qty > 0 && peakDate && day < peakDate)) {
      peak = qty;
      peakDate = day;
    }
  });
  return { peak, peakDate: peak > 0 ? peakDate : null };
}

export interface TotalQuantityCheck {
  /** 是否允許 Save */
  canSave: boolean;
  /** inline 錯誤訊息（不可 Save 時） */
  error: string | null;
  /** 欄位下方常駐說明 */
  helper: string | null;
}

/**
 * 驗證 total_quantity 變更。
 * 只在 nextTotal < currentTotal（降低）時套用 peak 檢查；
 * 增加或不變時，即使 peak 查詢 loading/失敗也不阻擋。
 */
export function checkTotalQuantityChange(params: {
  isEditing: boolean;
  currentTotal: number;
  nextTotal: number;
  peak: AmenityFuturePeak;
}): TotalQuantityCheck {
  const { isEditing, currentTotal, nextTotal, peak } = params;

  if (!isEditing) return { canSave: true, error: null, helper: null };

  const helper =
    peak.status === "ready"
      ? peak.peak > 0
        ? `目前今天以後最高已分配 ${peak.peak} 個（${peak.peakDate}），總數不得低於 ${peak.peak}。`
        : "目前沒有今天以後的備品分配。"
      : peak.status === "loading"
        ? "正在確認目前備品分配量…"
        : peak.status === "error"
          ? "無法確認目前備品分配量，請稍後再試。"
          : null;

  const decreasing = Number.isFinite(nextTotal) && nextTotal < currentTotal;
  if (!decreasing) return { canSave: true, error: null, helper };

  if (peak.status === "loading" || peak.status === "idle") {
    return { canSave: false, error: null, helper: helper ?? "正在確認目前備品分配量…" };
  }
  if (peak.status === "error") {
    return {
      canSave: false,
      error: "無法確認目前備品分配量，請稍後再試。",
      helper,
    };
  }
  if (nextTotal < peak.peak) {
    return {
      canSave: false,
      error: `無法將總數調整為 ${nextTotal}。目前 ${peak.peakDate} 已分配 ${peak.peak} 個，總數不得低於 ${peak.peak}。`,
      helper,
    };
  }
  return { canSave: true, error: null, helper };
}

/**
 * 讀取某備品「今天（Asia/Taipei）以後」的 peak 使用量。
 * 日期上限依實際 allocation 對應訂單的最晚退房日決定，不 hardcode horizon。
 * 只做 SELECT + 既有 read-only RPC，不建立新 RPC。
 */
export async function fetchAmenityFuturePeak(params: {
  accommodationId: string;
  amenityItemId: string;
  today?: string;
}): Promise<AmenityFuturePeak> {
  const { accommodationId, amenityItemId } = params;
  const today = params.today ?? taipeiToday();

  const { data: allocRows, error: allocError } = await supabase
    .from("order_amenity_allocations")
    .select("id, orders!inner(check_out_date, order_status)")
    .eq("amenity_item_id", amenityItemId)
    .neq("orders.order_status", "cancelled");
  if (allocError) throw allocError;

  let latestCheckout = "";
  (allocRows || []).forEach((row: any) => {
    const co = String(row.orders?.check_out_date || "").slice(0, 10);
    if (co && co > latestCheckout) latestCheckout = co;
  });

  if (!latestCheckout) return { status: "ready", peak: 0, peakDate: null };
  const end = addDaysDateOnly(latestCheckout, -1);
  if (end < today) return { status: "ready", peak: 0, peakDate: null };

  const { data, error } = await supabase.rpc("get_amenity_daily_usage", {
    p_accommodation_id: accommodationId,
    p_start: today,
    p_end: end,
    p_exclude_order_id: null,
  });
  if (error) throw error;

  const { peak, peakDate } = extractFuturePeak(data as UsageRow[], amenityItemId, today);
  return { status: "ready", peak, peakDate };
}
