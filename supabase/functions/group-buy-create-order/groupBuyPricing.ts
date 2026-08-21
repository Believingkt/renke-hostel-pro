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

/* ────────────────────────────────────────────────────────────────
 * 日期類型「不適用」（disabled_date_types）
 *
 * 語意與「三段價留空」完全無關：
 *   - 價格留空 → 沿用 group_buy_price（可預訂）
 *   - 日期類型列入 disabled_date_types → 該類型的住宿夜完全不可預訂
 * 舊方案 disabled_date_types = [] / null → 三種類型全部適用，行為與過往一致。
 * ──────────────────────────────────────────────────────────────── */

export const GROUP_BUY_DAY_TYPES: GroupBuyDayType[] = ["weekday", "peak", "holiday"];

export interface GroupBuyPackageAvailabilityFields {
  disabled_date_types?: GroupBuyDayType[] | string[] | null;
}

/** 該日期類型是否可預訂 */
export function isDateTypeEnabled(
  pkg: GroupBuyPackageAvailabilityFields,
  type: GroupBuyDayType,
): boolean {
  const list = pkg.disabled_date_types;
  if (!Array.isArray(list) || list.length === 0) return true;
  return !list.includes(type);
}

/** 方案目前仍可預訂的日期類型清單（全部不適用時為空陣列） */
export function enabledDateTypes(pkg: GroupBuyPackageAvailabilityFields): GroupBuyDayType[] {
  return GROUP_BUY_DAY_TYPES.filter((t) => isDateTypeEnabled(pkg, t));
}

/**
 * 只計算「仍適用日期類型」的最低有效價格。
 * 三種類型全部不適用時回傳 null（呼叫端應顯示「暫不開放」）。
 * 舊的 lowestEffectivePrice 維持原簽名不動，避免既有呼叫點受影響。
 */
export function lowestEnabledPrice(
  pkg: GroupBuyPackagePriceFields & GroupBuyPackageAvailabilityFields,
): number | null {
  const types = enabledDateTypes(pkg);
  if (types.length === 0) return null;
  return Math.min(...types.map((t) => effectivePrice(pkg, t)));
}

export interface DisabledTypeHit {
  date: string;
  type: GroupBuyDayType;
}

/** 住宿夜是否踩到「不適用的日期類型」（退房日不算住宿夜） */
export function findDisabledTypeNight(
  checkIn: string,
  checkOut: string,
  pkg: GroupBuyPackageAvailabilityFields,
  holidays: Set<string> | ReadonlySet<string>,
): DisabledTypeHit | null {
  const list = pkg.disabled_date_types;
  if (!Array.isArray(list) || list.length === 0) return null;
  for (const date of stayNightDates(checkIn, checkOut)) {
    const type = getGroupBuyDateType(date, holidays);
    if (!isDateTypeEnabled(pkg, type)) return { date, type };
  }
  return null;
}
