/**
 * P2-2C｜備品 Lifecycle Safety Guard（純邏輯 + read-only 查詢）
 *
 * 兩個「不同 domain」的規則，刻意分開，不與 total_quantity peak 混用：
 *
 * 【停用 deactivate】is_active true → false
 *   關心：今天（Asia/Taipei）＋未來是否仍有有效訂單使用（order_status <> 'cancelled'）。
 *   住宿夜 = check_in_date（含）～ check_out_date - 1（含）。
 *   歷史 allocation 不阻擋停用（停用不刪資料）。
 *   重新啟用（false → true）一律允許，不受 loading/error 影響。
 *
 * 【刪除 delete】
 *   關心：DB 是否存在「任何」 order_amenity_allocations row（含歷史、含 cancelled）。
 *   因為 FK 是 ON DELETE CASCADE，硬刪會真的刪掉既有訂單紀錄。
 *
 * 注意：這是 Frontend Guard，不是 atomic DB protection。
 * P2-2D（FK RESTRICT 或 BEFORE DELETE trigger）仍為 PENDING。
 */
import { supabase } from "@/integrations/supabase/client";
import { addDaysDateOnly } from "@/lib/amenityAllocation";
import { taipeiToday } from "@/lib/taipeiToday";

export type AmenityLifecycleStatus = "idle" | "loading" | "ready" | "error";

export interface AmenityLifecycle {
  status: AmenityLifecycleStatus;
  /** 今天＋未來仍有使用的有效訂單筆數 */
  futureOrderCount: number;
  /** 這些訂單中最近的入住日（YYYY-MM-DD），無則 null */
  nearestCheckIn: string | null;
  /** DB 是否存在任何 allocation row（含歷史、含 cancelled） */
  hasAnyAllocation: boolean;
}

export const IDLE_LIFECYCLE: AmenityLifecycle = {
  status: "idle",
  futureOrderCount: 0,
  nearestCheckIn: null,
  hasAnyAllocation: false,
};
export const LOADING_LIFECYCLE: AmenityLifecycle = { ...IDLE_LIFECYCLE, status: "loading" };
export const ERROR_LIFECYCLE: AmenityLifecycle = { ...IDLE_LIFECYCLE, status: "error" };

export interface LifecycleAllocationRow {
  orders?: {
    check_in_date?: string | null;
    check_out_date?: string | null;
    order_status?: string | null;
  } | null;
}

/** 從 allocation + order 資料算出「今天以後仍在使用」的有效訂單筆數與最近入住日 */
export function summarizeFutureUsage(
  rows: LifecycleAllocationRow[] | null | undefined,
  today: string,
): { futureOrderCount: number; nearestCheckIn: string | null } {
  let futureOrderCount = 0;
  let nearestCheckIn: string | null = null;

  (rows || []).forEach((row) => {
    const order = row.orders;
    if (!order) return;
    if (String(order.order_status || "") === "cancelled") return;
    const checkIn = String(order.check_in_date || "").slice(0, 10);
    const checkOut = String(order.check_out_date || "").slice(0, 10);
    if (!checkIn || !checkOut) return;
    // 最後一個住宿夜 = 退房日前一天
    const lastNight = addDaysDateOnly(checkOut, -1);
    if (lastNight < today) return;
    futureOrderCount += 1;
    if (!nearestCheckIn || checkIn < nearestCheckIn) nearestCheckIn = checkIn;
  });

  return { futureOrderCount, nearestCheckIn };
}

export interface LifecycleCheck {
  canSave: boolean;
  error: string | null;
  helper: string | null;
}

/**
 * 停用檢查。
 * 只有在 true → false 時才套用；其他情況（新增、改名、改備註、加總數、重新啟用）一律不阻擋。
 */
export function checkDeactivation(params: {
  isEditing: boolean;
  wasActive: boolean;
  nextActive: boolean;
  lifecycle: AmenityLifecycle;
}): LifecycleCheck {
  const { isEditing, wasActive, nextActive, lifecycle } = params;

  const deactivating = isEditing && wasActive && !nextActive;
  if (!deactivating) return { canSave: true, error: null, helper: null };

  if (lifecycle.status === "loading" || lifecycle.status === "idle") {
    return {
      canSave: false,
      error: null,
      helper: "正在確認此備品是否仍有未來訂單使用…",
    };
  }
  if (lifecycle.status === "error") {
    return {
      canSave: false,
      error: "無法確認目前備品使用狀況，請稍後再試。",
      helper: null,
    };
  }
  if (lifecycle.futureOrderCount > 0) {
    const detail = lifecycle.nearestCheckIn
      ? `目前仍有 ${lifecycle.futureOrderCount} 筆未來訂單使用此備品，最近入住日期為 ${lifecycle.nearestCheckIn}。`
      : `目前仍有 ${lifecycle.futureOrderCount} 筆未來訂單使用此備品。`;
    return {
      canSave: false,
      error: `此備品仍有今天或未來入住訂單正在使用，請先調整相關訂單的備品分配後再停用。${detail}`,
      helper: null,
    };
  }
  return { canSave: true, error: null, helper: "今天與未來沒有訂單使用此備品，可以停用。" };
}

export interface DeleteCheck {
  canDelete: boolean;
  /** 不可刪除時的說明 */
  message: string | null;
}

/** 刪除檢查：只要曾經存在 allocation row（含歷史、含 cancelled）就不可刪除 */
export function checkDelete(lifecycle: AmenityLifecycle): DeleteCheck {
  if (lifecycle.status === "loading" || lifecycle.status === "idle") {
    return { canDelete: false, message: "正在確認此備品是否曾被訂單使用…" };
  }
  if (lifecycle.status === "error") {
    return { canDelete: false, message: "無法確認目前備品使用狀況，請稍後再試。" };
  }
  if (lifecycle.hasAnyAllocation) {
    let message =
      "此備品已有訂單使用紀錄，因此無法刪除。若未來不再提供，請使用「停用」。";
    if (lifecycle.futureOrderCount > 0) {
      message += `目前仍有未完成住宿訂單正在使用（${lifecycle.futureOrderCount} 筆），請先處理相關訂單後再停用。`;
    }
    return { canDelete: false, message };
  }
  return { canDelete: true, message: null };
}

/**
 * 讀取單一備品的 lifecycle 狀態（單一 SELECT，無 N+1）。
 * 一次抓該 amenity 的 allocation + 對應訂單日期／狀態：
 * - hasAnyAllocation：任何 row（含 cancelled、含歷史）
 * - futureOrderCount / nearestCheckIn：排除 cancelled，且最後住宿夜 >= 今天
 */
export async function fetchAmenityLifecycle(params: {
  amenityItemId: string;
  today?: string;
}): Promise<AmenityLifecycle> {
  const today = params.today ?? taipeiToday();

  const { data, error } = await supabase
    .from("order_amenity_allocations")
    .select("id, orders(check_in_date, check_out_date, order_status)")
    .eq("amenity_item_id", params.amenityItemId);
  if (error) throw error;

  const rows = (data || []) as LifecycleAllocationRow[];
  const { futureOrderCount, nearestCheckIn } = summarizeFutureUsage(rows, today);

  return {
    status: "ready",
    futureOrderCount,
    nearestCheckIn,
    hasAnyAllocation: rows.length > 0,
  };
}
