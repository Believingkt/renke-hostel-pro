/**
 * 後台各處「開啟前台 / 回到前台」按鈕的唯一網址來源。
 * 一律導向新版包棟訂房頁 /booking/villa/{accId}，
 * 不論帳號權限、是否有包區方案，都不再導向舊版一般民宿訂房頁或舊首頁。
 */
export interface FrontendUrlAccommodation {
  id: string;
  custom_domain?: string | null;
}

export function buildFrontendUrl(acc: FrontendUrlAccommodation | null | undefined): string {
  if (!acc?.id) return "/booking";

  const host = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
  const isLovablePreview =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.includes("lovableproject.com") ||
    host.includes("lovable.app");

  const path = `/booking/villa/${acc.id}?accId=${acc.id}`;

  if (acc.custom_domain) {
    return `https://${acc.custom_domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}${path}`;
  }
  if (isLovablePreview) {
    return `${window.location.origin}${path}`;
  }
  return `https://booking.lakeze.com${path}`;
}

/** 僅有 accommodationId（無 custom_domain 資訊）時的相對路徑版本，供站內 navigate 使用。 */
export function frontendPath(accommodationId?: string | null): string {
  return accommodationId ? `/booking/villa/${accommodationId}?accId=${accommodationId}` : "/booking";
}
