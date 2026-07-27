/**
 * 產生訂房頁的 canonical 網址。
 *
 * 原則：canonical 必須指向「實際會渲染內容、且本身不會再轉址」的網址。
 * 舊版把 canonical 指到 `https://{custom_domain}/` 或 `https://booking.lakeze.com/{alias}`，
 * 但這兩者在前端都會再轉址到 `/booking/villa/{accId}` —— 對搜尋引擎而言是
 * 「canonical 指向一個會轉址的網址」，屬於弱訊號，權重可能無法正確歸戶。
 *
 * 規則（由高到低優先）：
 * 1. 民宿有自訂網域 → https://{custom_domain}/booking/villa/{id}
 * 2. 其他            → https://booking.lakeze.com/booking/villa/{id}
 * 3. 缺少 id 時      → 退回目前網址（去除查詢字串，避免日期/人數造成重複內容）
 *
 * 一律不帶查詢參數（accId／日期／人數），避免無限多組重複內容網址。
 */
export const BOOKING_PORTAL_ORIGIN = "https://booking.lakeze.com";

export function buildAccommodationCanonical(info: {
  id?: string | null;
  custom_domain?: string | null;
  short_url_alias?: string | null;
}): string {
  const id = info.id?.trim();

  if (id) {
    const domain = info.custom_domain?.trim();
    const origin = domain
      ? `https://${domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
      : BOOKING_PORTAL_ORIGIN;
    return `${origin}/booking/villa/${id}`;
  }

  // 沒有 id 的舊呼叫端：維持原本行為
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
