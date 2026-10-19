import { supabase } from "@lakeze/shared/integrations/supabase/client";

export const GRANT_NOTICE =
  "撥款金額已扣除 PAYUNi 手續費；人客多平台費另以多功能收付扣款。撥款預設為交易後 7 天（T+7）入 PAYUNi 帳戶；提領到銀行帳戶每月 5 次免費，第 6 次起每筆 15 元，上午 11 點前提領當天 18:00 前到帳。";
export const GRANT_OUTFLOW_NOTICE = "ATM 退款轉匯每筆 10 元，由商店 UNi 帳戶扣款；出帳列依 PAYUNi 原文顯示。";
export const MATCH_LABEL: Record<string, string> = { matched: "已對應", unmatched: "對不到交易", no_order: "非訂單出帳" };

export interface GrantRecord {
  id: string;
  accommodation_id: string;
  query_date: string;
  row_seq: number;
  trade_date: string | null;
  mer_trade_no: string | null;
  payment_date: string | null;
  action: string | null;
  type: string | null;
  execute_amt: number | null;
  fee: number | null;
  funds_amt: number | null;
  match_status: string;
  order_id: string | null;
  synced_at: string;
}
export const GRANT_COLS =
  "id, accommodation_id, query_date, row_seq, trade_date, mer_trade_no, payment_date, action, type, execute_amt, fee, funds_amt, match_status, order_id, synced_at";

// payuni_grant_records 尚未在產生的型別內
export const grantTable = () => (supabase as any).from("payuni_grant_records");

const TAIPEI_OFFSET_MS = 8 * 3_600_000;
export const taipeiDate = (offsetDays = 0, now = Date.now()) =>
  new Date(now + TAIPEI_OFFSET_MS + offsetDays * 86_400_000).toISOString().slice(0, 10);

export const money = (n: number | null | undefined) => (n == null ? "—" : `NT$ ${Number(n).toLocaleString()}`);
export const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("zh-TW", { dateStyle: "short", timeStyle: "short" }) : "—");

export interface DailyTotal { key: string; date: string; accommodation_id: string; count: number; funds: number; fee: number; unmatched: number; lastSynced: string }

/** 依撥款日（query_date）＋館別合計；lastSynced = max(synced_at) */
export function dailyTotals(rows: GrantRecord[]): DailyTotal[] {
  const m = new Map<string, DailyTotal>();
  for (const r of rows) {
    const key = `${r.query_date}|${r.accommodation_id}`;
    const t = m.get(key) ?? { key, date: r.query_date, accommodation_id: r.accommodation_id, count: 0, funds: 0, fee: 0, unmatched: 0, lastSynced: r.synced_at };
    t.count += 1;
    t.funds += Number(r.funds_amt ?? 0);
    t.fee += Number(r.fee ?? 0);
    if (r.match_status === "unmatched") t.unmatched += 1;
    if (r.synced_at > t.lastSynced) t.lastSynced = r.synced_at;
    m.set(key, t);
  }
  return [...m.values()].sort((a, b) => b.date.localeCompare(a.date) || a.accommodation_id.localeCompare(b.accommodation_id));
}
