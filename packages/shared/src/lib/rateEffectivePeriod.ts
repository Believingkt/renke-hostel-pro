/**
 * 費率版本 → 實際採用的獎金發放期別。
 *
 * 全站結算口徑：以「資料月首日」為版本切點，取 effective_from <= 資料月首日 的最新版本。
 * 因此一個生效日只有在「該月首日之後才生效」時，會延到下一個資料月才被採用。
 * 發放期為資料月的次月 10 日。
 */
export function firstPayoutPeriodForEffectiveFrom(effectiveFrom: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(effectiveFrom);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  const day = Number(m[3]);

  // 生效日非該月 1 日 → 該月資料月已錯過切點，順延到下個資料月
  let dataYear = year;
  let dataMonth = month;
  if (day > 1) {
    dataMonth += 1;
    if (dataMonth > 12) {
      dataMonth = 1;
      dataYear += 1;
    }
  }

  // 發放期 = 資料月次月 10 日
  let payoutYear = dataYear;
  let payoutMonth = dataMonth + 1;
  if (payoutMonth > 12) {
    payoutMonth = 1;
    payoutYear += 1;
  }
  return `${payoutYear}-${String(payoutMonth).padStart(2, "0")}-10`;
}

/** 顯示用短格式，例如「10/10 期」 */
export function payoutPeriodLabel(effectiveFrom: string): string | null {
  const p = firstPayoutPeriodForEffectiveFrom(effectiveFrom);
  if (!p) return null;
  const [, mm] = p.split("-");
  return `${Number(mm)}/10 期`;
}

/** 台北今天 yyyy-MM-dd */
function taipeiTodayStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * 顯示用費率切點：以「資料月首日」取版本，與 create-team-bonus-snapshots 的計算口徑一致。
 * @param dataMonthKey yyyy-MM；省略時取台北當月（＝目前正在累積的資料月）
 */
export function rateAsOfForDataMonth(dataMonthKey?: string): string {
  const key = dataMonthKey ?? taipeiTodayStr().slice(0, 7);
  return `${key}-01`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function shiftMonth(year: number, month: number, delta: number) {
  const zero = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
}

/**
 * 星探結算費率切點（A 口徑）：與資料窗起點對齊。
 *   10 日期 → 上月 21 日（資料窗 上月21–當月5 的起點）
 *   25 日期 → 當月 6 日（資料窗 當月6–當月20 的起點）
 * 即「資料期間開始前已生效」的版本才會被該期採用。
 */
export function scoutRateAsOf(
  year: number,
  month: number | null,
  period: "10" | "25" | number | null = "10",
): string {
  if (!month) return `${year}-12-31`;
  const code = String(period ?? "10");
  if (code === "25") return `${year}-${pad2(month)}-06`;
  const prev = shiftMonth(year, month, -1);
  return `${prev.year}-${pad2(prev.month)}-21`;
}

/** 星探系「目前累積中期別」的切點：最近一個已開始的資料窗起點 */
export function scoutRateAsOfToday(): string {
  const [ys, ms, ds] = taipeiTodayStr().split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (d >= 21) return `${y}-${pad2(m)}-21`;
  if (d >= 6) return `${y}-${pad2(m)}-06`;
  const prev = shiftMonth(y, m, -1);
  return `${prev.year}-${pad2(prev.month)}-21`;
}

/**
 * 星探系費率版本 → 首次被採用的發放期別（A 口徑）。
 * 期別資料窗起點：10 日期 = 上月 21、25 日期 = 當月 6。
 * 取「起點 >= 生效日」的最早一期。
 */
export function scoutFirstPayoutPeriod(
  effectiveFrom: string,
): { date: string; period: "10" | "25" } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(effectiveFrom);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  if (day <= 6) {
    // 同月 6 日起的資料窗 → 該月 25 日期
    return { date: `${year}-${pad2(month)}-25`, period: "25" };
  }
  if (day <= 21) {
    // 同月 21 日起的資料窗 → 次月 10 日期
    const n = shiftMonth(year, month, 1);
    return { date: `${n.year}-${pad2(n.month)}-10`, period: "10" };
  }
  // 次月 6 日起的資料窗 → 次月 25 日期
  const n = shiftMonth(year, month, 1);
  return { date: `${n.year}-${pad2(n.month)}-25`, period: "25" };
}

/** 星探系顯示用短格式，例如「7/25 期」 */
export function scoutPayoutPeriodLabel(effectiveFrom: string): string | null {
  const p = scoutFirstPayoutPeriod(effectiveFrom);
  if (!p) return null;
  const [, mm] = p.date.split("-");
  return `${Number(mm)}/${p.period} 期`;
}

