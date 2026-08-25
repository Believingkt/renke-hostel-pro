/**
 * KOL 預計上片時間（衍生欄位，不存 DB）
 *
 * 口徑與 LINE 推播事件 `kol_publish_reminder`
 * （supabase/functions/send-kol-publish-reminder）一致：
 *   預計上片日 = 入住日 + 14 天（= 正常情況下最晚上片日 / 上片期限）
 * 採計對象：實際訂房成立者（以 PMS orders 派生，查無訂單時回退 kol_profiles.booking_status = '成功訂房'）且 is_error = false。
 */

export const PUBLISH_DEADLINE_DAYS = 14;

export interface KolPublishRecord {
  id: string;
  name: string | null;
  ig_handle?: string | null;
  ig_url?: string | null;
  venue_name?: string | null;
  venue_id?: string | null;
  accommodation_id?: string | null;
  check_in_date: string | null;
  publish_date?: string | null;
  publish_url?: string | null;
  scout_id?: string | null;
  cid_code?: string | null;
  short_url?: string | null;
  cid_configured?: boolean | null;
  order_number?: string | null;
  booking_status?: string | null;
}

export type PublishStatus = "completed" | "overdue" | "due_soon" | "upcoming";

export const PUBLISH_STATUS_LABEL: Record<PublishStatus, string> = {
  completed: "已完成",
  overdue: "逾期",
  due_soon: "即將到期",
  upcoming: "待上片",
};

export const PUBLISH_STATUS_CLASS: Record<PublishStatus, string> = {
  completed: "bg-green-100 text-green-700 border-green-200",
  overdue: "bg-red-100 text-red-700 border-red-200",
  due_soon: "bg-amber-100 text-amber-700 border-amber-200",
  upcoming: "bg-muted text-muted-foreground border-border",
};

export const hasVal = (v: unknown): boolean =>
  v !== null && v !== undefined && String(v).trim() !== "";

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** 台北時區今日（YYYY-MM-DD） */
export function taipeiToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

/** 預計上片日（= 上片期限）；無入住日則為 null */
export function getExpectedPublishDate(kol: Pick<KolPublishRecord, "check_in_date">): string | null {
  if (!hasVal(kol.check_in_date)) return null;
  return addDaysYmd(kol.check_in_date as string, PUBLISH_DEADLINE_DAYS);
}

/** 是否已完成上片（發布日與發布連結皆有值，與推播口徑一致） */
export function isPublishCompleted(kol: Pick<KolPublishRecord, "publish_date" | "publish_url">): boolean {
  return hasVal(kol.publish_date) && hasVal(kol.publish_url);
}

export function getPublishStatus(
  kol: Pick<KolPublishRecord, "check_in_date" | "publish_date" | "publish_url">,
  today: string = taipeiToday(),
): PublishStatus {
  if (isPublishCompleted(kol)) return "completed";
  const expected = getExpectedPublishDate(kol);
  if (!expected) return "upcoming";
  if (expected < today) return "overdue";
  if (expected <= addDaysYmd(today, 3)) return "due_soon";
  return "upcoming";
}

/** 由「預計上片日區間」回推需查詢的 check_in_date 區間 */
export function expectedRangeToCheckInRange(from: string, to: string): { from: string; to: string } {
  return {
    from: addDaysYmd(from, -PUBLISH_DEADLINE_DAYS),
    to: addDaysYmd(to, -PUBLISH_DEADLINE_DAYS),
  };
}

/** 週日為起點的一週區間（依本地時間），offsetWeeks=1 為下週 */
export function weekRangeYmd(offsetWeeks = 0, base: Date = new Date()): { from: string; to: string } {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - d.getDay() + offsetWeeks * 7);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  const fmt = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { from: fmt(sunday), to: fmt(saturday) };
}

/** 未來 N 天（含今日） */
export function nextDaysRangeYmd(days: number, today: string = taipeiToday()): { from: string; to: string } {
  return { from: today, to: addDaysYmd(today, days - 1) };
}

/** 過去 N 天（含今日） */
export function pastDaysRangeYmd(days: number, today: string = taipeiToday()): { from: string; to: string } {
  return { from: addDaysYmd(today, -(days - 1)), to: today };
}

/** 月份區間，offsetMonths=0 本月、1 下月、-1 上月 */
export function monthRangeYmd(offsetMonths = 0, today: string = taipeiToday()): { from: string; to: string } {
  const [y, m] = today.split("-").map((v) => parseInt(v, 10));
  const start = new Date(Date.UTC(y, m - 1 + offsetMonths, 1));
  const end = new Date(Date.UTC(y, m + offsetMonths, 0));
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { from: fmt(start), to: fmt(end) };
}


/** 依預計上片日彙總每日筆數（回傳依日期排序） */
export function groupByExpectedDate(
  rows: KolPublishRecord[],
  today: string = taipeiToday(),
): { date: string; total: number; completed: number; overdue: number; pending: number }[] {
  const map = new Map<string, { date: string; total: number; completed: number; overdue: number; pending: number }>();
  for (const r of rows) {
    const expected = getExpectedPublishDate(r);
    if (!expected) continue;
    const cur = map.get(expected) ?? { date: expected, total: 0, completed: 0, overdue: 0, pending: 0 };
    cur.total += 1;
    const st = getPublishStatus(r, today);
    if (st === "completed") cur.completed += 1;
    else if (st === "overdue") cur.overdue += 1;
    else cur.pending += 1;
    map.set(expected, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}
