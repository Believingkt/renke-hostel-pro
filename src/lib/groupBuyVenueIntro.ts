import { supabase } from "@/integrations/supabase/client";
import { expandFacilitiesForAccommodations } from "@/lib/facility-merge";

export interface VenueIntroData {
  name: string;
  region: string;
  description: string | null;
  facilities: string[];
  check_in_notice: string | null;
  phone: string | null;
  address: string | null;
  gallery_urls: string[];
  location_description: string | null;
  is_visible: boolean;
}

/** 從官網（訂房頁）內容取得預設的民宿介紹資料 */
export async function fetchOfficialVenueIntro(accommodationId: string): Promise<VenueIntroData | null> {
  if (!accommodationId) return null;
  const [infoRes, photoRes, facRes, locRes] = await Promise.all([
    supabase
      .from("accommodation_info")
      .select("name, description, address, phone, check_in_notice, region_1, region_2")
      .eq("id", accommodationId)
      .maybeSingle(),
    supabase
      .from("accommodation_photos")
      .select("photo_url, photo_type, display_order")
      .eq("accommodation_id", accommodationId)
      .order("display_order"),
    supabase
      .from("accommodation_facilities")
      .select("*")
      .is("room_scope", null)
      .or(`accommodation_id.is.null,accommodation_id.eq.${accommodationId}`),
    supabase
      .from("location_info")
      .select("location_description")
      .eq("accommodation_id", accommodationId)
      .maybeSingle(),
  ]);

  const info = infoRes.data as any;
  if (!info) return null;

  return {
    name: info.name,
    region: [info.region_1, info.region_2].filter(Boolean).join("・"),
    description: info.description ?? null,
    facilities: expandFacilitiesForAccommodations((facRes.data ?? []) as any[], [accommodationId])
      .map((f: any) => f.facility_name)
      .filter(Boolean),
    check_in_notice: info.check_in_notice ?? null,
    phone: info.phone ?? null,
    address: info.address ?? null,
    gallery_urls: (photoRes.data ?? [])
      .filter((p: any) => p.photo_type !== "hero")
      .map((p: any) => p.photo_url)
      .filter(Boolean),
    location_description: locRes.data?.location_description ?? null,
    is_visible: true,
  };
}

/** 取得團購頁實際顯示的介紹（有自訂就用自訂，否則回退官網內容） */
export async function fetchGroupBuyVenueIntro(accommodationId: string): Promise<VenueIntroData | null> {
  const official = await fetchOfficialVenueIntro(accommodationId);
  if (!official) return null;

  const { data } = await supabase
    .from("group_buy_venue_intros")
    .select("*")
    .eq("accommodation_id", accommodationId)
    .maybeSingle();

  if (!data) return official;
  const row = data as any;

  return {
    ...official,
    description: row.description ?? official.description,
    facilities: row.facilities?.length ? row.facilities : official.facilities,
    check_in_notice: row.check_in_notice ?? official.check_in_notice,
    phone: row.phone ?? official.phone,
    address: row.address ?? official.address,
    gallery_urls: row.gallery_urls?.length ? row.gallery_urls : official.gallery_urls,
    is_visible: row.is_visible ?? true,
  };
}

/** 新增團購活動時：若尚無自訂介紹，帶入官網內容作為預設值 */
export async function ensureGroupBuyVenueIntroDefaults(accommodationId: string): Promise<void> {
  if (!accommodationId) return;
  const { data: existing } = await supabase
    .from("group_buy_venue_intros")
    .select("accommodation_id")
    .eq("accommodation_id", accommodationId)
    .maybeSingle();
  if (existing) return;

  const official = await fetchOfficialVenueIntro(accommodationId);
  if (!official) return;

  await supabase.from("group_buy_venue_intros").insert({
    accommodation_id: accommodationId,
    description: official.description,
    facilities: official.facilities,
    check_in_notice: official.check_in_notice,
    phone: official.phone,
    address: official.address,
    gallery_urls: official.gallery_urls.slice(0, 12),
    is_visible: true,
  } as any);
}

/** 將富文字 HTML 轉為純文字（保留段落換行），供團購頁與後台編輯器顯示 */
export function htmlToPlainText(input?: string | null): string {
  if (!input) return "";
  if (!/<[a-z][\s\S]*>/i.test(input)) return input;
  const withBreaks = input
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "・");
  const el = typeof document !== "undefined" ? document.createElement("div") : null;
  let text: string;
  if (el) {
    el.innerHTML = withBreaks;
    text = el.textContent || "";
  } else {
    text = withBreaks.replace(/<[^>]+>/g, "");
  }
  return text
    .replace(/&nbsp;/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter((l, i, arr) => l || (i > 0 && arr[i - 1]))
    .join("\n")
    .trim();
}
