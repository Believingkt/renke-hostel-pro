/**
 * 成交組 20% 團獎池「統一唯讀聚合」前端入口（Phase 2B）。
 *
 * Pool 的唯一 Source of Truth = 個人成交組獎金發放同源資料：
 *   closer_commission_snapshots（payout_month）
 *   + closer_commission_adjustments（adjustment_month）
 *   → 逐筆 splitCloserBonus().pool 加總
 *
 * 各頁一律呼叫本 helper（後端 closer-team-pool），不要各自重算。
 */

import { supabase } from "@lakeze/shared/integrations/supabase/client";

export interface CloserTeamPoolResult {
  payout_month: string;
  bonus_rate: number;
  gross_total: number;
  personal_total: number;
  snapshot_gross?: number;
  snapshot_personal?: number;
  snapshot_pool: number;
  /** 正式 Snapshot 尚未建立期間的 Preview 補位（逐筆 order_id 去重） */
  preview_gross?: number;
  preview_personal?: number;
  preview_pool?: number;
  adjustment_gross?: number;
  adjustment_personal?: number;
  adjustment_pool: number;
  positive_adjustment_pool: number;
  negative_adjustment_pool: number;
  pool_total: number;
  snapshot_count: number;
  preview_count?: number;
  adjustment_count: number;
}

/** 取某發放月（YYYY-MM）的團獎池聚合。唯讀，不寫任何 DB。 */
export async function fetchCloserTeamPool(
  payoutMonth: string,
): Promise<CloserTeamPoolResult | null> {
  const { data, error } = await supabase.functions.invoke("closer-team-pool", {
    body: { payout_month: payoutMonth },
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || "團獎池聚合失敗");
  return data as CloserTeamPoolResult;
}
