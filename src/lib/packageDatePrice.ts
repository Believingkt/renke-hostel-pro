import { supabase } from "@/integrations/supabase/client";
import type { PackageTier } from "@/hooks/use-accommodation-packages";

/**
 * 方案「單日價格覆寫」共用解析
 *
 * 取價優先序（全站唯一入口，前後台與伺服器驗價都走這個順序）：
 *   1. package_date_prices（庫存日曆上針對某方案某日直接改的價）
 *   2. accommodation_packages.tier_prices[tier]（平日／週五日／週六）
 *   3. accommodation_packages.sale_price（方案預設售價）
 */

export type PackagePriceSource = "override" | "tier" | "default";

export interface PackageDatePriceRow {
  package_id: string;
  date: string; // YYYY-MM-DD
  sale_price: number;
  original_price: number | null;
  note?: string | null;
}

/** key = `${packageId}_${date}` */
export type PackageDatePriceMap = Map<string, PackageDatePriceRow>;

export function overrideKey(packageId: string, date: string): string {
  return `${packageId}_${date}`;
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface EffectivePackagePrice {
  sale: number;
  original: number | null;
  source: PackagePriceSource;
}

export interface PackagePriceInput {
  id: string;
  sale_price: number;
  original_price?: number | null;
  tier_prices?: Partial<Record<PackageTier, { sale?: number | null; original?: number | null }>> | null;
}

/** 解析某方案在某一天的有效價格與來源 */
export function resolvePackagePriceForDate(
  pkg: PackagePriceInput,
  date: string,
  tier: PackageTier,
  overrides?: PackageDatePriceMap | null,
): EffectivePackagePrice {
  const ov = overrides?.get(overrideKey(pkg.id, date));
  if (ov && ov.sale_price != null) {
    return {
      sale: Number(ov.sale_price),
      original: ov.original_price != null ? Number(ov.original_price) : (pkg.original_price ?? null),
      source: "override",
    };
  }
  const tp = pkg.tier_prices?.[tier];
  if (tp && tp.sale != null) {
    return {
      sale: Number(tp.sale),
      original: tp.original != null ? Number(tp.original) : (pkg.original_price ?? null),
      source: "tier",
    };
  }
  return {
    sale: Number(pkg.sale_price),
    original: pkg.original_price != null ? Number(pkg.original_price) : null,
    source: "default",
  };
}

export const PACKAGE_PRICE_SOURCE_LABEL: Record<PackagePriceSource, string> = {
  override: "單日指定價",
  tier: "平日假日價",
  default: "方案預設價",
};

/** 載入某館別某日期區間的所有方案覆寫價 */
export async function fetchPackageDatePrices(
  accommodationId: string,
  from: string,
  to: string,
): Promise<PackageDatePriceMap> {
  const map: PackageDatePriceMap = new Map();
  if (!accommodationId) return map;
  const { data, error } = await supabase
    .from("package_date_prices")
    .select("package_id, date, sale_price, original_price, note")
    .eq("accommodation_id", accommodationId)
    .gte("date", from)
    .lte("date", to);
  if (error) {
    console.error("載入方案單日價格失敗:", error);
    return map;
  }
  for (const r of (data || []) as any[]) {
    map.set(overrideKey(r.package_id, r.date), {
      package_id: r.package_id,
      date: r.date,
      sale_price: Number(r.sale_price),
      original_price: r.original_price != null ? Number(r.original_price) : null,
      note: r.note ?? null,
    });
  }
  return map;
}

/** 載入單一方案在指定日期清單的覆寫價 */
export async function fetchPackageDatePricesForPackage(
  packageId: string,
  dates: string[],
): Promise<PackageDatePriceMap> {
  const map: PackageDatePriceMap = new Map();
  if (!packageId || dates.length === 0) return map;
  const { data, error } = await supabase
    .from("package_date_prices")
    .select("package_id, date, sale_price, original_price, note")
    .eq("package_id", packageId)
    .in("date", dates);
  if (error) {
    console.error("載入方案單日價格失敗:", error);
    return map;
  }
  for (const r of (data || []) as any[]) {
    map.set(overrideKey(r.package_id, r.date), {
      package_id: r.package_id,
      date: r.date,
      sale_price: Number(r.sale_price),
      original_price: r.original_price != null ? Number(r.original_price) : null,
      note: r.note ?? null,
    });
  }
  return map;
}
