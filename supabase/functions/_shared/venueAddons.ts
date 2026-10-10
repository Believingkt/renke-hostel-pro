// 館別原生加購（addon_settings）：LINE 管家與官網小安共用；價格一律取 DB，不混他館。
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export interface VenueAddon {
  addonType: string;
  name: string;
  pricePerUnit: number;
  unitLabel: string;
  minQty: number;
  maxQty: number;
  pricingMode: "per_night" | "per_stay";
}

/** addon_settings.addon_type 已是自由文字品名；僅做基本清理 */
export function cleanAddonName(t?: string | null): string {
  const s = String(t ?? "").trim();
  return s || "加購項目";
}

const VENUE_ADDON_SYNONYMS: { match: RegExp; terms: string[] }[] = [
  { match: /早餐|晚餐|餐券|餐食|下午茶|薄餅|吃/, terms: ["餐", "早餐", "晚餐", "下午茶", "薄餅", "buffet"] },
  { match: /烤肉|bbq|炭|燒烤/i, terms: ["烤肉", "bbq", "炭", "炭烤", "燒烤", "木炭", "清潔"] },
  { match: /寵物|毛小孩|狗|貓/, terms: ["寵物", "pet", "毛"] },
  { match: /加床|加人|多一位|床/, terms: ["加床", "加人", "床"] },
];

/** 官網小安加購意圖（寵物另有政策流程，不在此觸發） */
export function detectAddonIntent(text: string): boolean {
  return /加購|加價購|add-?on|早餐|晚餐|餐券|餐食|下午茶|烤肉|bbq|燒烤|木炭|加床|加人/i.test(text || "");
}

/**
 * 讀該館 addon_settings（啟用且上架，排除 pet/meal；與 BookingFlow 帶入規則一致）。
 * 依關鍵字命中優先；命中同義詞但無品項時：strict → []，否則回全部（≤10）。
 */
export async function fetchVenueAddons(
  sb: SupabaseClient,
  accId: string | null | undefined,
  keyword?: string | null,
  opts: { strict?: boolean; prioritize?: boolean; limit?: number } = {},
): Promise<VenueAddon[]> {
  if (!accId) return [];
  const { data } = await sb
    .from("addon_settings")
    .select("addon_type, price_per_unit, unit_label, min_quantity, max_quantity, pricing_mode, enabled, show_on_frontend, sort_order")
    .eq("accommodation_id", accId)
    .eq("enabled", true)
    .order("sort_order", { ascending: true });
  const all: VenueAddon[] = (data || [])
    // deno-lint-ignore no-explicit-any
    .filter((a: any) => a.show_on_frontend !== false && a.addon_type !== "pet" && a.addon_type !== "meal")
    // deno-lint-ignore no-explicit-any
    .map((a: any) => ({
      addonType: a.addon_type,
      name: cleanAddonName(a.addon_type),
      pricePerUnit: Number(a.price_per_unit ?? 0),
      unitLabel: a.unit_label ?? "份",
      minQty: Number(a.min_quantity ?? 0),
      maxQty: Number(a.max_quantity ?? 10),
      pricingMode: a.pricing_mode === "per_stay" ? "per_stay" : "per_night",
    }));
  const kw = keyword ?? "";
  const terms = VENUE_ADDON_SYNONYMS.filter((s) => s.match.test(kw)).flatMap((s) => s.terms);
  const matched = terms.length
    ? all.filter((v) => terms.some((t) => `${v.name} ${v.addonType}`.toLowerCase().includes(t)))
    : [];
  const limit = opts.limit ?? 10;
  // prioritize：關鍵字命中者在前，其餘補滿
  if (opts.prioritize) return [...matched, ...all.filter((v) => !matched.includes(v))].slice(0, limit);
  if (matched.length) return matched.slice(0, limit);
  if (opts.strict && terms.length) return [];
  return all.slice(0, limit);
}
