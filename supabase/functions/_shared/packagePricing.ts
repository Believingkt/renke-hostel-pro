/**
 * 共用方案取價（Edge 版）— 與官網 packageDatePrice 同一套優先序：
 *   package_date_prices.sale_price（單日指定）> accommodation_packages.tier_prices[tier] > sale_price
 * 關聯：accommodation_packages.primary_room_type_id = 房型（官網「綁定主房型」）。
 * 一房型多啟用方案時取「整段期間售價總和最低」者。
 * 無啟用/適用方案回 null，呼叫端再退回 room_inventory_pricing。
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export type PkgTier = "weekday" | "friday_sunday" | "weekend";

/** 以日期字串（YYYY-MM-DD）＋國定假日集合判定 tier（與官網 detectTierByDate 完全一致）：
 *  國定假日（含補假）或週六 = weekend；週五/週日 = friday_sunday；其餘 = weekday。
 *  國定假日來源一律為 public_holidays（holiday / compensatory_day_off），不另寫死。 */
export function classifyPkgTier(dateISO: string, holidaySet?: Set<string>): PkgTier {
  if (holidaySet && holidaySet.has(dateISO)) return "weekend";
  const day = new Date(`${dateISO}T00:00:00Z`).getUTCDay(); // 0=日 … 6=六
  if (day === 6) return "weekend";
  if (day === 5 || day === 0) return "friday_sunday";
  return "weekday";
}

export interface PackagePriceResult {
  packageId: string;
  packageName: string;
  saleTotal: number;
  originalTotal: number | null;
  guestMax: number | null;
}

interface PkgRow {
  id: string;
  name: string;
  sale_price: number | null;
  original_price: number | null;
  // deno-lint-ignore no-explicit-any
  tier_prices: any;
  applicable_tiers: string[] | null;
  enabled: boolean | null;
  primary_room_type_id: string | null;
  guest_count_max: number | null;
}

/** 批次：回傳 roomTypeId → 最低價啟用方案（整段 dates）。無則該房型不在 map。 */
export async function lowestPackagePricesForRooms(
  sb: SupabaseClient,
  accId: string,
  roomTypeIds: string[],
  dates: string[],
): Promise<Map<string, PackagePriceResult>> {
  const out = new Map<string, PackagePriceResult>();
  if (!accId || roomTypeIds.length === 0 || dates.length === 0) return out;

  const { data: pkgsRaw } = await sb
    .from("accommodation_packages")
    .select("id, name, sale_price, original_price, tier_prices, applicable_tiers, enabled, primary_room_type_id, guest_count_max")
    .eq("accommodation_id", accId)
    .eq("enabled", true)
    .in("primary_room_type_id", roomTypeIds);
  const pkgs = (pkgsRaw || []) as PkgRow[];
  if (pkgs.length === 0) return out;

  // 國定假日（含補假）集合 — 與官網同源 public_holidays（本館）
  const { data: holRaw } = await sb
    .from("public_holidays")
    .select("holiday_date, holiday_type")
    .eq("accommodation_id", accId)
    .in("holiday_type", ["holiday", "compensatory_day_off"])
    .in("holiday_date", dates);
  const holidaySet = new Set<string>((holRaw || []).map((h: any) => h.holiday_date));

  const { data: dpRaw } = await sb
    .from("package_date_prices")
    .select("package_id, date, sale_price, original_price, is_available")
    .in("package_id", pkgs.map((p) => p.id))
    .in("date", dates);
  const ovMap = new Map<string, { sale: number | null; original: number | null }>();
  for (const r of (dpRaw || []) as any[]) {
    ovMap.set(`${r.package_id}:${r.date}`, {
      sale: r.sale_price != null ? Number(r.sale_price) : null,
      original: r.original_price != null ? Number(r.original_price) : null,
    });
  }


  for (const pkg of pkgs) {
    const rtId = pkg.primary_room_type_id!;
    let saleTotal = 0;
    let originalTotal = 0;
    let hasOriginal = false;
    let priceable = true;
    for (const d of dates) {
      const tier = classifyPkgTier(d, holidaySet);
      const ov = ovMap.get(`${pkg.id}:${d}`);
      // 與官網 resolvePackagePriceForDate 完全一致：override > tier_prices[tier] > sale_price
      // （不以 applicable_tiers / is_available 閘門定價；可售與否由庫存另行判斷）
      const tp = pkg.tier_prices && typeof pkg.tier_prices === "object" ? pkg.tier_prices[tier] : null;
      let sale: number | null = null;
      let original: number | null = null;
      if (ov && ov.sale != null) { sale = ov.sale; original = ov.original ?? (pkg.original_price ?? null); }
      else if (tp && tp.sale != null) { sale = Number(tp.sale); original = tp.original != null ? Number(tp.original) : (pkg.original_price ?? null); }
      else { sale = pkg.sale_price != null ? Number(pkg.sale_price) : null; original = pkg.original_price ?? null; }
      if (sale == null || !(sale > 0)) { priceable = false; break; }
      saleTotal += sale;
      if (original != null && original > 0) { originalTotal += original; hasOriginal = true; }
      else { originalTotal += sale; }
    }
    if (!priceable) continue;
    const prev = out.get(rtId);
    if (!prev || saleTotal < prev.saleTotal) {
      out.set(rtId, {
        packageId: pkg.id,
        packageName: pkg.name,
        saleTotal,
        originalTotal: hasOriginal ? originalTotal : null,
        guestMax: pkg.guest_count_max != null ? Number(pkg.guest_count_max) : null,
      });
    }
  }
  return out;
}
