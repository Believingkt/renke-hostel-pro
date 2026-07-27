import { supabase } from "@/integrations/supabase/client";

type AccommodationDomainRow = {
  custom_domain: string | null;
  short_url_alias: string | null;
};

const stripDomain = (value: string) =>
  value
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .trim()
    .toLowerCase();

/**
 * 已實際上線（DNS 已指向本專案）的網域清單。
 * custom_domain 與 alias 都只是後台設定值，未必真的有對應網域；
 * 若推導出的網域不在清單內，一律留在目前網域完成付款，
 * 避免導向不存在的網站造成「網頁失效」。
 */
const LIVE_DOMAINS = new Set([
  "sensaninn.lakeze.com",
  "tiansong-villa.lakeze.com",
  "oliviaboutiquehotel.lakeze.com",
  "traveldays.lakeze.com",
  "booking.lakeze.com",
  "hq.lakeze.com",
  "renke-hostel-pro.lovable.app",
]);

/** 預覽 / 開發環境：一律留在當前網域，方便測試與避免跨網域 session 遺失 */
function isPreviewHost(hostname: string) {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.endsWith(".lovableproject.com") ||
    h.includes("id-preview--")
  );
}


export function getPaymentOriginFromAccommodation(acc?: AccommodationDomainRow | null) {
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";

  if (typeof window !== "undefined" && isPreviewHost(window.location.hostname)) {
    return currentOrigin;
  }

  const customDomain = acc?.custom_domain ? stripDomain(acc.custom_domain) : "";
  const alias = acc?.short_url_alias ? stripDomain(acc.short_url_alias) : "";
  const aliasDomain = alias ? `${alias}.lakeze.com` : "";

  // 只接受確認上線的網域，custom_domain 也一樣要檢查
  const domain = LIVE_DOMAINS.has(customDomain)
    ? customDomain
    : LIVE_DOMAINS.has(aliasDomain)
      ? aliasDomain
      : "";

  return domain ? `https://${domain}` : currentOrigin;
}


export async function getPaymentOriginForAccommodation(accommodationId?: string | null) {
  if (typeof window !== "undefined" && isPreviewHost(window.location.hostname)) {
    return window.location.origin;
  }
  if (!accommodationId) return window.location.origin;

  const { data } = await supabase
    .from("accommodation_info")
    .select("custom_domain, short_url_alias")
    .eq("id", accommodationId)
    .maybeSingle();

  return getPaymentOriginFromAccommodation(data as AccommodationDomainRow | null);
}

export function isSameOriginIgnoringWww(originA: string, originB: string) {
  try {
    return stripDomain(new URL(originA).hostname) === stripDomain(new URL(originB).hostname);
  } catch {
    return originA === originB;
  }
}

export function redirectToPaymentOrigin(targetOrigin: string) {
  if (!targetOrigin || isSameOriginIgnoringWww(window.location.origin, targetOrigin)) return false;
  window.location.replace(`${targetOrigin}${window.location.pathname}${window.location.search}${window.location.hash}`);
  return true;
}
