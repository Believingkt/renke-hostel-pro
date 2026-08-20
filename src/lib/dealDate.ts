/**
 * 成交日（orders.order_date）共用工具。
 *
 * 規則（見 .lovable/memory/features/admin/order-deal-date-rules.md）：
 * - order_date 是全站「成交日」基準，created_at 絕對不可改。
 * - 編輯成交日只改「日期」，時分秒沿用原本的值（以台北時區換日）。
 * - 期別（YYYY-MM）一律以台北時區判定。
 */
import { supabase } from "@/integrations/supabase/client";

const TZ = "Asia/Taipei";

/** 台北時區的日期字串 YYYY-MM-DD */
export function taipeiDateStr(value?: string | Date | null): string {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** 台北時區的期別 YYYY-MM */
export function taipeiMonthOf(value?: string | Date | null): string {
  return taipeiDateStr(value).slice(0, 7);
}

/** 台北時區的時分秒 HH:mm:ss */
export function taipeiTimeStr(value?: string | Date | null): string {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "12:00:00";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * 以新的「台北日期」重組成交日，保留原本的時分秒。
 * @param originalIso 原本的 order_date（timestamptz ISO）
 * @param newDate     新的日期 YYYY-MM-DD（台北）
 * @returns ISO 字串（含 +08:00 offset）
 */
export function composeDealDate(originalIso: string | null | undefined, newDate: string): string {
  const time = taipeiTimeStr(originalIso);
  return new Date(`${newDate}T${time}+08:00`).toISOString();
}

/** 是否為未來日期（以台北今天為界） */
export function isFutureTaipeiDate(dateStr: string): boolean {
  return dateStr > taipeiDateStr();
}

/**
 * 該期別（snapshot_month）的成交組獎金是否已結算／已發放。
 * 判定：該期任一快照已被標記 payout_status = 'paid'。
 */
export async function isCommissionPeriodSettled(month: string): Promise<boolean> {
  if (!month) return false;
  const { data: snaps, error } = await supabase
    .from("closer_commission_snapshots")
    .select("id")
    .eq("snapshot_month", month);
  if (error) throw error;
  const ids = (snaps ?? []).map((s: { id: string }) => s.id);
  if (ids.length === 0) return false;

  const { data: marks, error: markErr } = await supabase
    .from("commission_payout_marks")
    .select("id")
    .eq("source_table", "closer_commission_snapshots")
    .eq("payout_status", "paid")
    .in("source_id", ids)
    .limit(1);
  if (markErr) throw markErr;
  return (marks ?? []).length > 0;
}
