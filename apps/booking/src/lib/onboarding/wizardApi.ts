import { supabase } from "@lakeze/shared/integrations/supabase/client";

export type TierKey = "weekday" | "friday_sunday" | "weekend";
export type TierPrices = Record<TierKey, { sale: number; original: number }>;
export const TIER_LABELS: Record<TierKey, string> = { weekday: "平日", friday_sunday: "旺日（週五／週日）", weekend: "假日" };
/** 依入住當晚日期判斷（packagePricing.ts classifyPkgTier、use-accommodation-packages.tsx detectTierByDate） */
export const TIER_HINTS: Record<TierKey, string> = {
  weekday: "週一到週四入住的晚上。",
  friday_sunday: "週五、週日入住的晚上。",
  weekend: "週六，以及總部設定的國定假日、補假日當晚（連假逐晚判斷）。",
};

export interface PrecheckItem { key: string; label: string; ok?: boolean; detail: string; needs_ack?: boolean; hq_detail?: string }
/** OTA 串接狀態：只回給 super_admin，僅顯示、不擋送審與核准 */
export interface OtaStatus { owlting: boolean; hotelnabe: boolean; detail: string }
export interface PrecheckResult { red: PrecheckItem[]; yellow: PrecheckItem[]; red_ok: boolean; window_start: string; window_end: string; ota_status?: OtaStatus }
export interface SavePackageResult {
  package_id: string; template_id: string | null; template_name: string | null;
  template_room_type_id: string | null; room_type_name: string | null;
  primary_room_type_id: string; primary_room_type_name: string; room_type_matches: boolean;
}
export interface SeasonPlan { insert_count: number; overwrite_count: number; overwrites: { date: string; old_sale: number | null; old_original: number | null }[] }
export interface InventoryResult { start: string; end: string; room_types: { room_type_id: string; name: string; inserted: number; skipped: number }[] }

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.details ? `${error.message}（${error.details}）` : error.message);
  return data as T;
}

export const wizardApi = {
  saveRoomType: (a: { accommodationId: string; roomTypeId: string | null; name: string; capacity: number; basePrice: number; roomCount: number }) =>
    call<string>("wizard_save_room_type", {
      p_accommodation_id: a.accommodationId, p_room_type_id: a.roomTypeId, p_name: a.name,
      p_capacity: a.capacity, p_base_price: a.basePrice, p_room_count: a.roomCount,
    }),
  savePackage: (a: { accommodationId: string; packageId: string | null; name: string; primaryRoomTypeId: string; guestCount: number; tierPrices: TierPrices }) =>
    call<SavePackageResult>("wizard_save_package", {
      p_accommodation_id: a.accommodationId, p_package_id: a.packageId, p_name: a.name,
      p_primary_room_type_id: a.primaryRoomTypeId, p_guest_count: a.guestCount, p_tier_prices: a.tierPrices,
    }),
  previewSeason: (a: SeasonArgs) => call<SeasonPlan>("wizard_preview_season_prices", seasonArgs(a)),
  applySeason: (a: SeasonArgs) => call<SeasonPlan>("wizard_apply_season_prices", seasonArgs(a)),
  openInventory: (accommodationId: string, start: string, end: string) =>
    call<InventoryResult>("wizard_open_inventory", { p_accommodation_id: accommodationId, p_start: start, p_end: end }),
  precheck: (accommodationId: string) => call<PrecheckResult>("wizard_precheck", { p_accommodation_id: accommodationId }),
  saveBasicInfo: (a: { accommodationId: string; name: string; address: string; phone: string; description: string }) =>
    call<Record<string, string | null>>("wizard_save_basic_info", {
      p_accommodation_id: a.accommodationId, p_name: a.name, p_address: a.address, p_phone: a.phone, p_description: a.description,
    }),
  // p_ota_ack 自 20261022090000 起後端忽略；仍送 true，讓 migration 套用前的舊後端也能送審
  submit: (accommodationId: string) =>
    call<PrecheckResult>("wizard_submit", { p_accommodation_id: accommodationId, p_ota_ack: true }),
  returnToOwner: (accommodationId: string, reason: string) =>
    call<null>("wizard_return", { p_accommodation_id: accommodationId, p_reason: reason }),
};

export interface SeasonArgs { packageId: string; start: string; end: string; sale: number; original: number }
const seasonArgs = (a: SeasonArgs) => ({ p_package_id: a.packageId, p_start: a.start, p_end: a.end, p_sale: a.sale, p_original: a.original });

/** 前端先擋：三日型售價、原價都 > 0 的整數，原價 ≥ 售價（後端函式為最終把關） */
export function tierPriceError(p: Partial<Record<TierKey, { sale?: number; original?: number }>>): string | null {
  for (const k of Object.keys(TIER_LABELS) as TierKey[]) {
    const s = p[k]?.sale ?? 0;
    const o = p[k]?.original ?? 0;
    if (!(Number.isInteger(s) && s > 0 && Number.isInteger(o) && o > 0)) return `${TIER_LABELS[k]}售價與原價都必須是大於 0 的整數`;
    if (o < s) return `${TIER_LABELS[k]}原價不得低於售價`;
  }
  return null;
}

export function taipeiToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

export function addMonths(day: string, months: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
