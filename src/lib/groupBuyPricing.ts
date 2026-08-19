/**
 * 團購方案逐晚價格規則（前台 / 後台 / Edge Function 共用語意）
 *
 * 日期分類與一般訂房的 classifyDayTier 完全一致：
 *   國定假日 > 週六 → holiday
 *   週五 / 週日      → peak
 *   週一～週四       → weekday
 *
 * 國定假日資料一律來自 public_holidays（各館別後台維護），不可寫死在程式中。
 * excluded_dates 不是價格類型，屬於 availability 驗證階段。
 */

export type GroupBuyDayType = "weekday" | "peak" | "holiday";

export const GROUP_BUY_DAY_TYPE_LABEL: Record<GroupBuyDayType, string> = {
  weekday: "平日",
  peak: "旺日",
  holiday: "假日",
};

export const GROUP_BUY_DAY_TYPE_HINT: Record<GroupBuyDayType, string> = {
  weekday: "週一～週四",
  peak: "週五、週日",
  holiday: "週六、國定假日",
};

export interface GroupBuyPackagePriceFields {
  group_buy_price: number;
  weekday_price?: number | null;
  peak_price?: number | null;
  holiday_price?: number | null;
}

/** yyyy-MM-dd → 當地 Date（避免 UTC 位移） */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function toDateKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 判斷單一日期的團購價格類型（國定假日優先於星期分類） */
export function getGroupBuyDateType(
  dateKey: string,
  holidays: Set<string> | ReadonlySet<string>,
): GroupBuyDayType {
  if (holidays.has(dateKey)) return "holiday";
  const day = parseDateKey(dateKey).getDay();
  if (day === 6) return "holiday";
  if (day === 5 || day === 0) return "peak";
  return "weekday";
}

/** 三種價格的有效值（未設定時 fallback 原團購價） */
export function effectivePrice(pkg: GroupBuyPackagePriceFields, type: GroupBuyDayType): number {
  const base = Math.round(Number(pkg.group_buy_price) || 0);
  const raw = type === "weekday" ? pkg.weekday_price : type === "peak" ? pkg.peak_price : pkg.holiday_price;
  const n = raw == null ? NaN : Math.round(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : base;
}

/** 方案的三種有效價格 */
export function effectivePrices(pkg: GroupBuyPackagePriceFields): Record<GroupBuyDayType, number> {
  return {
    weekday: effectivePrice(pkg, "weekday"),
    peak: effectivePrice(pkg, "peak"),
    holiday: effectivePrice(pkg, "holiday"),
  };
}

/** 方案最低有效價格（方案卡／Hero「起」價用） */
export function lowestEffectivePrice(pkg: GroupBuyPackagePriceFields): number {
  const p = effectivePrices(pkg);
  return Math.min(p.weekday, p.peak, p.holiday);
}

/** 住宿夜清單（不含退房日） */
export function stayNightDates(checkIn: string, checkOut: string): string[] {
  if (!checkIn || !checkOut || checkOut <= checkIn) return [];
  const out: string[] = [];
  const cur = parseDateKey(checkIn);
  const end = parseDateKey(checkOut);
  while (cur < end) {
    out.push(toDateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export interface NightPrice {
  date: string;
  type: GroupBuyDayType;
  price: number;
}

export interface GroupBuyStayPrice {
  nights: number;
  nightlyBreakdown: NightPrice[];
  baseAccommodationTotal: number;
}

/** 逐晚分類 → 逐晚取價 → 加總住宿費（不含兒童加價） */
export function calculateGroupBuyStayPrice(opts: {
  checkIn: string;
  checkOut: string;
  pkg: GroupBuyPackagePriceFields;
  holidays: Set<string> | ReadonlySet<string>;
}): GroupBuyStayPrice {
  const dates = stayNightDates(opts.checkIn, opts.checkOut);
  const nightlyBreakdown = dates.map<NightPrice>((date) => {
    const type = getGroupBuyDateType(date, opts.holidays);
    return { date, type, price: effectivePrice(opts.pkg, type) };
  });
  return {
    nights: nightlyBreakdown.length,
    nightlyBreakdown,
    baseAccommodationTotal: nightlyBreakdown.reduce((s, n) => s + n.price, 0),
  };
}

/** 住宿夜是否踩到方案不適用日期（退房日不算住宿夜） */
export function findExcludedNight(
  checkIn: string,
  checkOut: string,
  excludedDates: Iterable<string>,
): string | null {
  const excluded = new Set(excludedDates);
  if (excluded.size === 0) return null;
  for (const d of stayNightDates(checkIn, checkOut)) {
    if (excluded.has(d)) return d;
  }
  return null;
}
