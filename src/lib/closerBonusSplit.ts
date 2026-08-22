/**
 * 成交組「個人獎金 / 團獎池提撥」拆分（Phase 2A）。
 *
 * 正式商業規則（唯一來源，禁止各頁自行寫 *0.8 / 1 - rate）：
 *   Gross            = closer_commission_snapshots.closer_commission_amount
 *                      （以及 closer_commission_adjustments.closer_amount）
 *   Pool  提撥       = Gross × bonus_rate
 *   Personal 個人實發 = Gross − Pool
 *
 * DB 一律保存 Gross，Personal 只在讀取／發放解析時推導，不回寫、不加欄位。
 *
 * Rounding：沿用 roundBonus()。為確保 Personal + Pool = Gross 完全守恆，
 * 固定規則為「Pool 先取整，Personal = round(Gross) − Pool」。
 *
 * bonus_rate 有 effective_from 版本，一律以「該筆 payout_month（發放月）當時
 * 生效的版本」為準，版本挑選沿用 teamBonusRevenue.pickCurrent()。
 */

import { roundBonus } from "./bonusRounding";
import { pickCurrent } from "./teamBonusRevenue";

export interface CloserBonusSplit {
  /** 原始成交獎金（取整後） */
  gross: number;
  /** 個人實際發放 */
  personal: number;
  /** 團獎池提撥 */
  pool: number;
  personalRate: number;
  poolRate: number;
}

/** 唯一拆分函式：負數（取消扣回）同樣適用，Personal 為負值 */
export function splitCloserBonus(
  grossCommission: number | null | undefined,
  bonusRate: number | null | undefined,
): CloserBonusSplit {
  const rawRate = Number(bonusRate);
  const poolRate = Number.isFinite(rawRate) && rawRate > 0 ? Math.min(rawRate, 1) : 0;
  const gross = roundBonus(grossCommission);
  const pool = roundBonus(Number(grossCommission ?? 0) * poolRate);
  return {
    gross,
    personal: gross - pool,
    pool,
    personalRate: 1 - poolRate,
    poolRate,
  };
}

/** 只要個人實發金額的捷徑 */
export function personalCloserBonus(
  grossCommission: number | null | undefined,
  bonusRate: number | null | undefined,
): number {
  return splitCloserBonus(grossCommission, bonusRate).personal;
}

interface RateRow {
  bonus_rate: number | null;
  effective_from: string;
  created_at?: string;
}

/** 月份鍵（YYYY-MM）→ 該月第一天 */
function monthFirstDay(monthKey: string): string {
  return `${String(monthKey).slice(0, 7)}-01`;
}

/**
 * 單一 resolver：讀取 closer_team_bonus_settings 全部版本，
 * 回傳「依 asOf 日期挑出當時生效 bonus_rate」的查詢器。
 * 三頁共用，不要各自 query + 各自挑版本。
 */
export async function loadCloserBonusRateResolver(client: any): Promise<{
  rateAsOf: (dateOrMonth: string | null | undefined) => number;
  rateForPayoutMonth: (monthKey: string | null | undefined) => number;
}> {
  let rows: RateRow[] = [];
  try {
    const { data } = await client
      .from("closer_team_bonus_settings")
      .select("bonus_rate, effective_from, created_at");
    rows = ((data ?? []) as RateRow[]).filter((r) => !!r?.effective_from);
  } catch {
    rows = [];
  }

  const rateAsOf = (dateOrMonth: string | null | undefined): number => {
    const raw = String(dateOrMonth ?? "");
    if (!raw) return 0;
    const asOf = raw.length === 7 ? monthFirstDay(raw) : raw.slice(0, 10);
    const cur = pickCurrent(rows as any[], asOf) as RateRow | null;
    const r = Number(cur?.bonus_rate ?? 0);
    return Number.isFinite(r) && r > 0 ? r : 0;
  };

  return { rateAsOf, rateForPayoutMonth: (m) => rateAsOf(m ? monthFirstDay(m) : null) };
}
