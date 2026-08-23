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

/**
 * 星探結算費率切點：與 calculate-scout-payout 一致，取「結算年月的 28 日」。
 */
export function scoutRateAsOf(year: number, month: number | null): string {
  if (!month) return `${year}-12-31`;
  return `${year}-${String(month).padStart(2, "0")}-28`;
}

/** 星探系「目前應採用版本」的切點：台北當月 28 日 */
export function scoutRateAsOfToday(): string {
  const [y, m] = taipeiTodayStr().split("-");
  return `${y}-${m}-28`;
}

/**
 * 星探系費率版本 → 首次被採用的發放期別。
 * calculate-scout-payout 以「結算年月 28 日」為切點，且同月 10 日期／25 日期共用同一切點，
 * 因此生效日 <= 該月 28 日 → 自該月 10 日期起採用；日期 > 28 → 順延至次月 10 日期。
 */
export function scoutFirstPayoutPeriod(effectiveFrom: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(effectiveFrom);
  if (!m) return null;
  let year = Number(m[1]);
  let month = Number(m[2]);
  const day = Number(m[3]);
  if (day > 28) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return `${year}-${String(month).padStart(2, "0")}-10`;
}

/** 星探系顯示用短格式，例如「7/10 期」 */
export function scoutPayoutPeriodLabel(effectiveFrom: string): string | null {
  const p = scoutFirstPayoutPeriod(effectiveFrom);
  if (!p) return null;
  const [, mm] = p.split("-");
  return `${Number(mm)}/10 期`;
}

