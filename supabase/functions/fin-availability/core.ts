// Fin（Intercom AI 客服）跨館查房況：純函式（驗證輸入、彙總房型、組訂房連結），不碰 IO，供單元測試。
import { isValidDateStr, type RoomTypeResult } from "../_shared/availability.ts";

export const MAX_NIGHTS = 14;
export const MAX_RESULTS = 10;
export const BOOKING_BASE_URL = "https://booking.lakeze.com";

export interface FinQuery {
  checkIn: string;
  checkOut: string;
  lastNight: string;
  nights: number;
  guests: number;
  region: string | null;
  accommodation: string | null;
}

export type ParseResult = { ok: true; q: FinQuery } | { ok: false; error: string };

const DAY_MS = 86_400_000;
const toUtc = (d: string) => Date.parse(d + "T00:00:00Z");
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** 只保留可安全放進 PostgREST or/ilike 的字元，避免注入 , ( ) * % 等語法字元 */
export function sanitizeTerm(raw: string | null): string | null {
  if (raw == null) return null;
  const s = raw.replace(/[,()*%\\:."']/g, " ").replace(/\s+/g, " ").trim().slice(0, 50);
  return s || null;
}

export function parseFinQuery(params: URLSearchParams): ParseResult {
  const checkIn = params.get("check_in") || "";
  const checkOut = params.get("check_out") || "";
  if (!checkIn || !checkOut) return { ok: false, error: "請提供入住日 check_in 與退房日 check_out（格式 YYYY-MM-DD）" };
  if (!isValidDateStr(checkIn) || !isValidDateStr(checkOut)) return { ok: false, error: "日期格式錯誤，請使用 YYYY-MM-DD" };
  const nights = Math.round((toUtc(checkOut) - toUtc(checkIn)) / DAY_MS);
  if (nights <= 0) return { ok: false, error: "退房日必須晚於入住日" };
  if (nights > MAX_NIGHTS) return { ok: false, error: `最多只能查詢 ${MAX_NIGHTS} 晚` };

  let guests = 2;
  const g = params.get("guests");
  if (g != null && g !== "") {
    if (!/^\d+$/.test(g) || Number(g) < 1 || Number(g) > 100) return { ok: false, error: "人數 guests 必須是 1 以上的整數" };
    guests = Number(g);
  }
  return {
    ok: true,
    q: {
      checkIn, checkOut, nights, guests,
      lastNight: isoDay(toUtc(checkOut) - DAY_MS),
      region: sanitizeTerm(params.get("region")),
      accommodation: sanitizeTerm(params.get("accommodation")),
    },
  };
}

export interface RoomSummary {
  available: boolean;
  remaining: number;
  total_price: number | null;
  avg_nightly_price: number | null;
  price_note?: string;
}

/** 住宿期間每晚 is_available && remaining > 0 才可訂；remaining 取各晚最小值；任一晚無價 → total null */
export function summarizeRoomType(rt: RoomTypeResult, nights: number): RoomSummary {
  const days = rt.days;
  const available = days.length === nights && days.every((d) => d.is_available && d.remaining > 0);
  const remaining = days.length ? Math.min(...days.map((d) => d.remaining)) : 0;
  const hasNullPrice = days.some((d) => d.price == null);
  const total = hasNullPrice ? null : days.reduce((s, d) => s + (d.price as number), 0);
  return {
    available,
    remaining,
    total_price: total,
    avg_nightly_price: total == null ? null : Math.round(total / nights),
    ...(total == null ? { price_note: "請洽客服" } : {}),
  };
}

export function capacityFits(capacity: number | null | undefined, guests: number): boolean {
  return capacity == null || capacity >= guests;
}

export function bookingUrl(acc: { id: string; short_url_alias?: string | null }, q: Pick<FinQuery, "checkIn" | "checkOut" | "guests">): string {
  const path = acc.short_url_alias ? `/${encodeURIComponent(acc.short_url_alias)}` : `/booking/villa/${acc.id}`;
  const qs = new URLSearchParams({ checkIn: q.checkIn, checkOut: q.checkOut, adults: String(q.guests) });
  return `${BOOKING_BASE_URL}${path}?${qs.toString()}`;
}

export interface FinResultRow {
  accommodation_id: string;
  accommodation_name: string;
  region: string;
  room_type_id: string;
  room_type_name: string;
  plan_name: string | null;
  capacity: number | null;
  available: true;
  remaining: number;
  list_price: number | null;
  discount_label?: string;
  total_price: number | null;
  avg_nightly_price: number | null;
  price_note?: string;
  booking_url: string;
}

// ── 包區／入住方案（accommodation_packages）計價：與 validate-order-prices 相同順序 ──
export type PkgTier = "weekday" | "friday_sunday" | "weekend";

export interface PackageRow {
  id: string;
  accommodation_id: string;
  name: string;
  guest_count: number;
  guest_count_max: number | null;
  applicable_tiers: PkgTier[] | null;
  primary_room_type_id: string | null;
  room_type_ids: string[] | null;
  original_price: number | null;
  sale_price: number | null;
  tier_prices: Partial<Record<PkgTier, { sale?: number | null; original?: number | null }>> | null;
  excluded_date_ranges: Array<{ start?: string; end?: string }> | null;
}

export interface PkgDateOverride {
  package_id: string;
  date: string;
  sale_price: number | null;
  original_price: number | null;
  is_available: boolean | null;
}

/** 國定假日／補假或週六 → weekend；週五、週日 → friday_sunday；其餘 weekday */
export function packageTier(date: string, holidaySet: Set<string>): PkgTier {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (holidaySet.has(date) || day === 6) return "weekend";
  if (day === 5 || day === 0) return "friday_sunday";
  return "weekday";
}

/** 與前台 SavingsBadge.calcDiscountPercent 相同：四捨五入，無折扣回 undefined */
export function discountLabel(list: number | null, total: number | null): string | undefined {
  if (list == null || total == null || !list || list <= total) return undefined;
  const pct = Math.round(((list - total) / list) * 100);
  return pct > 0 ? `人客多優惠 -${pct}%` : undefined;
}

export const packageCapacity = (p: PackageRow) => p.guest_count_max ?? p.guest_count;
export const packageRoomTypeId = (p: PackageRow) => p.primary_room_type_id ?? p.room_type_ids?.[0] ?? null;

const num = (v: unknown) => (v == null ? null : Number(v));

export interface PackageSummary {
  available: boolean;
  remaining: number;
  list_price: number | null;
  total_price: number | null;
}

/**
 * 方案在住宿期間是否可訂與價格：
 * 房型每晚可售、任一晚不在不適用區間、單日 is_available≠false、入住日 tier 在適用日型內（單日 true 可補開）。
 * 售價：單日指定價 > tier 價 > 預設售價；原價：單日原價 > 單日售價 > tier 原價 > 方案原價 > 房價 > 售價。
 */
export function summarizePackage(
  pkg: PackageRow,
  rt: RoomTypeResult,
  nights: number,
  holidaySet: Set<string>,
  overrides: Map<string, PkgDateOverride>,
): PackageSummary {
  const room = summarizeRoomType(rt, nights);
  const ranges = Array.isArray(pkg.excluded_date_ranges) ? pkg.excluded_date_ranges : [];
  const ovOf = (d: string) => overrides.get(`${pkg.id}_${d}`);
  const excluded = rt.days.some((d) => ranges.some((r) => r?.start && r?.end && d.date >= r.start && d.date <= r.end));
  const closedByOverride = rt.days.some((d) => ovOf(d.date)?.is_available === false);
  const firstNight = rt.days[0]?.date;
  const tierOpen = !!firstNight && (
    (pkg.applicable_tiers || []).includes(packageTier(firstNight, holidaySet)) || ovOf(firstNight)?.is_available === true
  );
  const available = room.available && !excluded && !closedByOverride && tierOpen;

  if (pkg.sale_price == null) {
    return { available, remaining: room.remaining, list_price: room.total_price, total_price: room.total_price };
  }
  const salePrice = Number(pkg.sale_price);
  const pkgOriginal = num(pkg.original_price);
  let total = 0;
  let list = 0;
  for (const d of rt.days) {
    const tier = packageTier(d.date, holidaySet);
    const ov = ovOf(d.date);
    const ovSale = num(ov?.sale_price);
    const ovOriginal = num(ov?.original_price);
    const tierSale = num(pkg.tier_prices?.[tier]?.sale);
    const tierOriginal = num(pkg.tier_prices?.[tier]?.original);
    const sale = ovSale != null ? ovSale : tierSale != null ? tierSale : salePrice;
    const original = ovSale != null && ovOriginal != null && ovOriginal > 0 ? ovOriginal
      : ovSale != null ? ovSale
      : tierOriginal != null && tierOriginal > 0 ? tierOriginal
      : pkgOriginal != null && pkgOriginal > 0 ? pkgOriginal
      : d.price != null && d.price > 0 ? d.price
      : sale;
    total += sale;
    list += original;
  }
  return { available, remaining: room.remaining, list_price: list, total_price: total };
}

/** 依 total_price 升冪（無價排最後），最多 10 筆；message 以全部可訂數量計 */
export function finalize(rows: FinResultRow[], unavailableCount: number) {
  const sorted = [...rows].sort((a, b) => (a.total_price ?? Infinity) - (b.total_price ?? Infinity));
  return {
    results: sorted.slice(0, MAX_RESULTS),
    unavailable_count: unavailableCount,
    message: rows.length > 0 ? `共 ${rows.length} 間可訂` : "這段日期沒有符合的房型",
  };
}
