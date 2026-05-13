import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PackageTier = "weekday" | "friday_sunday" | "weekend";

export interface PackageInclude {
  text: string;
  available: "yes" | "no" | "optional";
  price_note?: string;
}

export interface AccommodationPackage {
  id: string;
  accommodation_id: string;
  name: string;
  subtitle: string | null;
  guest_count: number;
  guest_count_max: number | null;
  child_count_max: number | null;
  child_age_note: string | null;
  original_price: number | null;
  sale_price: number;
  room_allocation: string | null;
  applicable_tiers: PackageTier[];
  tags: string[];
  includes: PackageInclude[];
  primary_room_type_id: string | null;
  display_order: number;
  enabled: boolean;
}

export function detectTierByDate(date: Date | null | undefined): PackageTier {
  const d = date ?? new Date();
  const day = d.getDay();
  if (day === 6) return "weekend";
  if (day === 5 || day === 0) return "friday_sunday";
  return "weekday";
}

export function useAccommodationPackages(accommodationId: string | null, opts?: { onlyEnabled?: boolean }) {
  const [packages, setPackages] = useState<AccommodationPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPackages = useCallback(async () => {
    if (!accommodationId) {
      setPackages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    let query = supabase
      .from("accommodation_packages")
      .select("*")
      .eq("accommodation_id", accommodationId)
      .order("display_order", { ascending: true })
      .order("guest_count", { ascending: true });
    if (opts?.onlyEnabled !== false) query = query.eq("enabled", true);
    const { data, error } = await query;
    if (error) {
      setError(error.message);
      setPackages([]);
    } else {
      setPackages((data || []) as any);
    }
    setLoading(false);
  }, [accommodationId, opts?.onlyEnabled]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  return { packages, loading, error, refetch: fetchPackages };
}

// ─────────────────────────────────────────────────────────────
// 把資料庫的 packages 轉成 CapacityPriceLadder 用的 PRICING_TABLE 結構
// （只給非森山民宿用；森山仍走 SENSAN_PRICING_TABLE）
// ─────────────────────────────────────────────────────────────
import type {
  SensanPricingTier,
  SensanTierPrice,
} from "@/lib/sensan-pricing";

export function buildPricingTableFromPackages(
  packages: AccommodationPackage[]
): Record<SensanPricingTier, SensanTierPrice[]> {
  const table: Record<SensanPricingTier, SensanTierPrice[]> = {
    weekday: [],
    friday_sunday: [],
    weekend: [],
  };

  // 依 display_order / guest_count 排序
  const sorted = [...packages].sort((a, b) => {
    if (a.display_order !== b.display_order) return a.display_order - b.display_order;
    return a.guest_count - b.guest_count;
  });

  for (const pkg of sorted) {
    if (!pkg.enabled) continue;
    const tierPrice: SensanTierPrice = {
      guestCount: pkg.guest_count,
      original: pkg.original_price ?? pkg.sale_price,
      sale: pkg.sale_price,
      roomAllocation: pkg.room_allocation || pkg.subtitle || pkg.name,
      isFewPeople: pkg.tags?.includes("early_bird") || pkg.tags?.includes("few_people"),
      roomTypeId: pkg.primary_room_type_id || undefined,
      planName: pkg.name,
    };
    for (const tier of pkg.applicable_tiers) {
      table[tier].push(tierPrice);
    }
  }

  // 每個 tier 內依 guestCount 升冪
  (Object.keys(table) as SensanPricingTier[]).forEach((k) => {
    table[k].sort((a, b) => a.guestCount - b.guestCount);
  });

  return table;
}

/** 從所有方案彙整出含 (available='yes') 的內容清單，去重 */
export function aggregateIncludesFromPackages(
  packages: AccommodationPackage[]
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const pkg of packages) {
    if (!pkg.enabled) continue;
    for (const inc of pkg.includes || []) {
      if (inc.available === "yes" && inc.text && !seen.has(inc.text)) {
        seen.add(inc.text);
        result.push(inc.text);
      }
    }
  }
  return result;
}
