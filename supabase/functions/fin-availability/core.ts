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
  capacity: number | null;
  available: true;
  remaining: number;
  total_price: number | null;
  avg_nightly_price: number | null;
  price_note?: string;
  booking_url: string;
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
