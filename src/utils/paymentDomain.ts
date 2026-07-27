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
 * alias 只是後台代稱，未必有對應網域；若 alias 推導出的網域不在清單內，
 * 一律留在目前網域，避免導向不存在的網站造成「網頁失效」。
 */
const LIVE_DOMAINS = new Set([
  "sensaninn.lakeze.com",
  "tiansong-villa.lakeze.com",
  "oliviaboutiquehotel.lakeze.com",
  "traveldays.lakeze.com",
  "booking.lakeze.com",
]);

export function getPaymentOriginFromAccommodation(acc?: AccommodationDomainRow | null) {
  const customDomain = acc?.custom_domain ? stripDomain(acc.custom_domain) : "";
  const alias = acc?.short_url_alias ? stripDomain(acc.short_url_alias) : "";
  const aliasDomain = alias ? `${alias}.lakeze.com` : "";
  const domain = customDomain || (LIVE_DOMAINS.has(aliasDomain) ? aliasDomain : "");
  return domain ? `https://${domain}` : window.location.origin;
}


export async function getPaymentOriginForAccommodation(accommodationId?: string | null) {
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