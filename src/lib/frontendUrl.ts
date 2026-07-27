/**
 * 前台訂房頁連結的**唯一**產生入口。
 *
 * 規則（不可繞過）：
 *   任何指向前台訂房頁的連結、按鈕、導轉，一律只能透過本檔案的
 *   `openFrontendBooking()` / `bookingPath()` / `bookingAbsoluteUrl()` 產生。
 *   禁止在其他檔案手寫 `/booking/${id}` 或 `/booking/villa/${id}` 字串。
 *   （src/lib/__tests__/no-legacy-booking-links.test.ts 會自動掃描把關）
 *
 * 目標路徑固定為新版包棟訂房頁 `/booking/villa/{accId}`，
 * 不論帳號權限、是否有包區方案，都不再導向舊版一般民宿訂房頁或舊首頁。
 */

export const BOOKING_PORTAL_HOST = "booking.lakeze.com";

export interface BookingTarget {
  /** 民宿 UUID（必要） */
  accommodationId?: string | null;
  /** 自訂網域，例如 sensaninn.lakeze.com（可選） */
  customDomain?: string | null;
  /** 額外查詢參數 */
  params?: Record<string, string | number | null | undefined>;
  /** 錨點，例如 "rooms"（不含 #） */
  hash?: string;
}

function normalizeDomain(domain?: string | null): string | null {
  const d = domain?.trim();
  if (!d) return null;
  return d.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function buildQuery(target: BookingTarget): string {
  const sp = new URLSearchParams();
  // accId 一律帶上，供 AccommodationContext 在跨網域情境下解析
  if (target.accommodationId) sp.set("accId", target.accommodationId);
  for (const [k, v] of Object.entries(target.params || {})) {
    if (v === null || v === undefined || v === "") continue;
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

function buildHash(target: BookingTarget): string {
  if (!target.hash) return "";
  return target.hash.startsWith("#") ? target.hash : `#${target.hash}`;
}

/** 站內相對路徑（給 react-router 的 navigate / Link 用）。 */
export function bookingPath(target: BookingTarget | string | null | undefined): string {
  const t: BookingTarget = typeof target === "string" ? { accommodationId: target } : target || {};
  if (!t.accommodationId) return "/booking";
  return `/booking/villa/${t.accommodationId}${buildQuery(t)}${buildHash(t)}`;
}

/** 完整絕對網址（給 window.open / 複製分享 / Email 用）。 */
export function bookingAbsoluteUrl(target: BookingTarget | string | null | undefined): string {
  const t: BookingTarget = typeof target === "string" ? { accommodationId: target } : target || {};
  const path = bookingPath(t);

  const domain = normalizeDomain(t.customDomain);
  if (domain) return `https://${domain}${path}`;

  const host = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
  const isLocalOrPreview =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.includes("lovableproject.com") ||
    host.includes("lovable.app");
  if (isLocalOrPreview) return `${window.location.origin}${path}`;

  return `https://${BOOKING_PORTAL_HOST}${path}`;
}

export interface OpenFrontendBookingOptions {
  /** 傳入 react-router 的 navigate，站內跳轉時使用 */
  navigate?: (to: string, opts?: { replace?: boolean }) => void;
  /** 以新分頁開啟（後台「開啟前台」按鈕用） */
  newTab?: boolean;
  /** 站內導轉時是否取代歷史紀錄 */
  replace?: boolean;
}

/**
 * 開啟前台包棟訂房頁 —— 全站唯一入口。
 *
 * - `newTab: true` → 以絕對網址（含自訂網域）開新分頁
 * - 有傳 `navigate` → 站內相對路徑跳轉（不重整頁面）
 * - 兩者皆無 → 直接改變 window.location
 *
 * 回傳實際使用的網址，方便測試與「複製連結」情境。
 */
export function openFrontendBooking(
  target: BookingTarget | string | null | undefined,
  options: OpenFrontendBookingOptions = {},
): string {
  const t: BookingTarget = typeof target === "string" ? { accommodationId: target } : target || {};
  const { navigate, newTab, replace } = options;

  if (newTab) {
    const url = bookingAbsoluteUrl(t);
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
    return url;
  }

  // 站內跳轉：若指定了與目前不同的自訂網域，必須整頁跳轉
  const domain = normalizeDomain(t.customDomain);
  const currentHost = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
  if (domain && domain.toLowerCase() !== currentHost) {
    const url = bookingAbsoluteUrl(t);
    if (typeof window !== "undefined") window.location.href = url;
    return url;
  }

  const path = bookingPath(t);
  if (navigate) {
    navigate(path, { replace });
  } else if (typeof window !== "undefined") {
    if (replace) window.location.replace(path);
    else window.location.href = path;
  }
  return path;
}

/* ------------------------------------------------------------------ *
 * 相容別名（既有呼叫端沿用，內部一律轉呼叫上面的唯一實作）
 * ------------------------------------------------------------------ */

export interface FrontendUrlAccommodation {
  id: string;
  custom_domain?: string | null;
}

/** @deprecated 請改用 bookingAbsoluteUrl() */
export function buildFrontendUrl(acc: FrontendUrlAccommodation | null | undefined): string {
  return bookingAbsoluteUrl({ accommodationId: acc?.id, customDomain: acc?.custom_domain });
}

/** @deprecated 請改用 bookingPath() */
export function frontendPath(accommodationId?: string | null): string {
  return bookingPath(accommodationId);
}
