/**
 * 產生訂房頁的 canonical 網址。
 *
 * 規則（由高到低優先）：
 * 1. 民宿有自訂網域 → https://{custom_domain}/
 * 2. 民宿有 short_url_alias → https://booking.lakeze.com/{alias}
 * 3. 其他 → 目前網址（去除查詢字串，避免日期/人數造成重複內容）
 *
 * 目的：所有舊版訂房頁 / 帶參數的網址都統一指向同一個新版包棟訂房頁，
 *       避免搜尋引擎收錄到已停用的舊頁或無限多組參數網址。
 */
export const BOOKING_PORTAL_ORIGIN = "https://booking.lakeze.com";

export function buildAccommodationCanonical(info: {
  custom_domain?: string | null;
  short_url_alias?: string | null;
}): string {
  const domain = info.custom_domain?.trim();
  if (domain) {
    return `https://${domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}/`;
  }

  const alias = info.short_url_alias?.trim();
  if (alias) {
    return `${BOOKING_PORTAL_ORIGIN}/${alias}`;
  }

  if (typeof window !== "undefined") {
    return `${window.location.origin}${window.location.pathname}`;
  }
  return BOOKING_PORTAL_ORIGIN;
}
