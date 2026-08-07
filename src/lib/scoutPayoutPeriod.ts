/**
 * 發放期別判定（台北時間）
 *
 * 與後端 `cron-dispatcher-commission` 的 `resolveScoutPeriod()` 同口徑：
 *   日 <= 10        -> 當月 10 日期
 *   11 <= 日 <= 25  -> 當月 25 日期
 *   日 > 25         -> 次月 10 日期
 *
 * 資料窗（星探系依入住日 check_in_date）：
 *   10 日期 -> 上月 21 ~ 當月 5
 *   25 日期 -> 當月 6  ~ 當月 20
 *
 * 月結型獎金（成交組分潤、AM 系列、網紅營銷、場域成交…）只在 10 日期發放，
 * 其資料月 = 發放月的上一個月。
 */

export type PayoutPeriodCode = "10" | "25";

export interface PayoutPeriod {
  /** 發放年 */
  year: number;
  /** 發放月 */
  month: number;
  /** 期別 */
  period: PayoutPeriodCode;
  /** 發放月 key：YYYY-MM */
  payoutMonthKey: string;
  /** 星探系資料窗起（YYYY-MM-DD，含） */
  periodStart: string;
  /** 星探系資料窗迄（YYYY-MM-DD，含） */
  periodEnd: string;
  /** 月結型資料月 key：YYYY-MM（＝發放月 - 1） */
  dataMonthKey: string;
  /** 月結型資料月年 */
  dataYear: number;
  /** 月結型資料月月份 */
  dataMonth: number;
  /** 是否為發放月結型獎金的期別（只有 10 日期） */
  isMonthlyPayout: boolean;
  /** 顯示用短標籤：8/10 期 */
  label: string;
  /** 顯示用資料窗標籤：7/21–8/5 */
  windowLabel: string;
}

export function taipeiParts(d: Date = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of f.formatToParts(d)) parts[p.type] = p.value;
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}

const pad = (n: number) => String(n).padStart(2, "0");
const dateStr = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function addMonths(y: number, m: number, delta: number) {
  const zero = y * 12 + (m - 1) + delta;
  return { y: Math.floor(zero / 12), m: (zero % 12) + 1 };
}

/** 由「發放年月 + 期別」建出完整期別資訊 */
export function buildPayoutPeriod(
  year: number,
  month: number,
  period: PayoutPeriodCode,
): PayoutPeriod {
  const prev = addMonths(year, month, -1);
  const periodStart =
    period === "10" ? dateStr(prev.y, prev.m, 21) : dateStr(year, month, 6);
  const periodEnd =
    period === "10" ? dateStr(year, month, 5) : dateStr(year, month, 20);

  return {
    year,
    month,
    period,
    payoutMonthKey: `${year}-${pad(month)}`,
    periodStart,
    periodEnd,
    dataMonthKey: `${prev.y}-${pad(prev.m)}`,
    dataYear: prev.y,
    dataMonth: prev.m,
    isMonthlyPayout: period === "10",
    label: `${month}/${period} 期`,
    windowLabel:
      period === "10"
        ? `${prev.m}/21–${month}/5`
        : `${month}/6–${month}/20`,
  };
}

/** 依台北時間今日判定「即將發放的下一期」 */
export function resolveNextPayoutPeriod(now: Date = new Date()): PayoutPeriod {
  const { y, m, d } = taipeiParts(now);
  if (d <= 10) return buildPayoutPeriod(y, m, "10");
  if (d <= 25) return buildPayoutPeriod(y, m, "25");
  const next = addMonths(y, m, 1);
  return buildPayoutPeriod(next.y, next.m, "10");
}

/** 上一期（25 日期 -> 同月 10 日期；10 日期 -> 上月 25 日期） */
export function resolvePrevPayoutPeriod(p: PayoutPeriod): PayoutPeriod {
  if (p.period === "25") return buildPayoutPeriod(p.year, p.month, "10");
  const prev = addMonths(p.year, p.month, -1);
  return buildPayoutPeriod(prev.y, prev.m, "25");
}

/** 下一期（10 日期 -> 同月 25 日期；25 日期 -> 次月 10 日期） */
export function resolveFollowingPayoutPeriod(p: PayoutPeriod): PayoutPeriod {
  if (p.period === "10") return buildPayoutPeriod(p.year, p.month, "25");
  const next = addMonths(p.year, p.month, 1);
  return buildPayoutPeriod(next.y, next.m, "10");
}
