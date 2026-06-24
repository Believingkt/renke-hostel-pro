import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { eachDayOfInterval, addDays, format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import {
  detectTierByDate,
  getPackagePriceForTier,
  isPackageExcludedOnDate,
  type PackageTier,
} from "@/hooks/use-accommodation-packages";

interface Item {
  id: string;
  name: string;
  cover: string | null;
  rating: number | null;
  reviewCount: number | null;
  price: number | null;
  region: string | null;
}

interface Props {
  excludeId: string;
  region?: string | null;
  /** 搜尋人數，用來挑最接近的方案價格 */
  adults?: number;
  /** 入住 / 退房日期（yyyy-MM-dd），用來計算 tier 價格 */
  checkIn?: string | null;
  checkOut?: string | null;
}

/**
 * 鄰近住宿：
 * - 僅顯示同 region_1 的物業
 * - 有日期時：依該日期的 tier (weekday / friday_sunday / weekend) 計算總價，挑最低
 * - 無日期時：取「最接近搜尋人數」的方案 sale_price (fallback original_price)
 * - 搜不到方案 → 不顯示價格（不顯示 NT$0）
 */
const SimilarStaysCarousel = ({ excludeId, region, adults = 2, checkIn, checkOut }: Props) => {
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!region) {
      setItems([]);
      return;
    }
    (async () => {
      // region_1 在資料庫存在「宜蘭」/「宜蘭縣」混用 → 用 ilike 寬鬆比對
      const regionKey = region.replace(/[縣市]$/, "");
      // 1. 同 region_1 的物業（排除自己）
      const { data } = await (supabase
        .from("accommodation_info") as any)
        .select("id, name, region_1, google_reviews_cache, og_image_url")
        .ilike("region_1", `${regionKey}%`)
        .neq("id", excludeId)
        .limit(12);
      if (cancelled || !data || data.length === 0) {
        setItems([]);
        return;
      }

      const ids: string[] = data.map((d: any) => d.id);

      const [{ data: packages }, { data: cardPhotos }, { data: heroPhotos }, { data: holidays }] = await Promise.all([
        (supabase.from("accommodation_packages") as any)
          .select(
            "accommodation_id, guest_count, guest_count_max, sale_price, original_price, enabled, applicable_tiers, tier_prices, excluded_date_ranges",
          )
          .in("accommodation_id", ids)
          .eq("enabled", true),
        (supabase.from("portal_featured_card_photos") as any)
          .select("accommodation_id, photo_url, display_order")
          .in("accommodation_id", ids)
          .order("display_order", { ascending: true }),
        (supabase.from("accommodation_photos") as any)
          .select("accommodation_id, photo_url, display_order")
          .in("accommodation_id", ids)
          .eq("photo_type", "hero")
          .order("display_order", { ascending: true }),
        (supabase.from("public_holidays") as any)
          .select("accommodation_id, holiday_date"),
      ]);

      // 解析日期
      const ci = checkIn ? parseISO(checkIn) : null;
      const co = checkOut ? parseISO(checkOut) : null;
      const hasDates = !!(ci && co && co > ci);
      const stayDates = hasDates ? eachDayOfInterval({ start: ci!, end: addDays(co!, -1) }) : [];
      const nights = stayDates.length;

      const priceMap = new Map<string, number>();
      const byAcc = new Map<string, any[]>();
      (packages || []).forEach((p: any) => {
        if (!p.accommodation_id) return;
        const arr = byAcc.get(p.accommodation_id) || [];
        arr.push(p);
        byAcc.set(p.accommodation_id, arr);
      });

      byAcc.forEach((pkgs, accId) => {
        // 先找剛好涵蓋 adults 的方案
        const inRange = pkgs.filter((p) => {
          const min = p.guest_count ?? 0;
          const max = p.guest_count_max ?? p.guest_count ?? 99;
          return adults >= min && adults <= max;
        });
        const candidates = inRange.length > 0 ? inRange : pkgs;

        const holidaySet = new Set(
          (holidays || [])
            .filter((h: any) => !h.accommodation_id || h.accommodation_id === accId)
            .map((h: any) => h.holiday_date),
        );

        let bestTotal: number | null = null;

        candidates.forEach((p: any) => {
          // 有日期：按 tier 計算總價；任一晚被排除或所有晚都不適用 tier 則跳過
          if (hasDates) {
            if (stayDates.some((d) => isPackageExcludedOnDate(p, d))) return;
            let total = 0;
            let counted = 0;
            for (const d of stayDates) {
              const tier: PackageTier = detectTierByDate(d, holidaySet.has(format(d, "yyyy-MM-dd")));
              const tiers: PackageTier[] = Array.isArray(p.applicable_tiers) ? p.applicable_tiers : [];
              if (!tiers.includes(tier)) continue;
              const { sale } = getPackagePriceForTier(p, tier);
              if (!sale || sale <= 0) continue;
              total += sale;
              counted++;
            }
            if (counted !== nights) return; // 必須全部晚數都有對應 tier 價
            const nightly = Math.round(total / nights);
            if (bestTotal == null || nightly < bestTotal) bestTotal = nightly;
          } else {
            const price =
              p.sale_price != null && Number(p.sale_price) > 0
                ? Number(p.sale_price)
                : p.original_price != null && Number(p.original_price) > 0
                  ? Number(p.original_price)
                  : null;
            if (price == null) return;
            if (bestTotal == null || price < bestTotal) bestTotal = price;
          }
        });

        if (bestTotal != null) priceMap.set(accId, bestTotal);
      });

      const coverMap = new Map<string, string>();
      (cardPhotos || []).forEach((p: any) => {
        if (p.accommodation_id && !coverMap.has(p.accommodation_id) && p.photo_url) {
          coverMap.set(p.accommodation_id, p.photo_url);
        }
      });

      const heroCoverMap = new Map<string, string>();
      (heroPhotos || []).forEach((p: any) => {
        if (p.accommodation_id && !heroCoverMap.has(p.accommodation_id) && p.photo_url) {
          heroCoverMap.set(p.accommodation_id, p.photo_url);
        }
      });

      const list: Item[] = data.map((d: any) => {
        const cache = d.google_reviews_cache as any;
        return {
          id: d.id,
          name: d.name,
          cover: coverMap.get(d.id) || heroCoverMap.get(d.id) || d.og_image_url || null,
          rating: typeof cache?.rating === "number" ? cache.rating : null,
          reviewCount: typeof cache?.totalReviews === "number" ? cache.totalReviews : null,
          price: priceMap.get(d.id) ?? null,
          region: d.region_1 || null,
        };
      });

      if (!cancelled) setItems(list.slice(0, 8));
    })();
    return () => {
      cancelled = true;
    };
  }, [excludeId, region, adults, checkIn, checkOut]);

  if (items.length === 0) return null;

  return (
    <section className="py-5 bg-background">
      <h2 className="text-[20px] font-bold text-foreground px-4 mb-3">您可能也喜歡</h2>
      <div className="-mx-4 px-4 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 scrollbar-none">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => navigate(`/booking/villa/${it.id}`)}
            className="snap-start shrink-0 w-[68%] text-left"
          >
            <Card className="overflow-hidden border-border/60 h-full">
              <div className="aspect-[4/3] bg-muted overflow-hidden">
                {it.cover ? (
                  <img
                    src={it.cover}
                    alt={it.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full" style={{ background: "hsl(25, 60%, 95%)" }} />
                )}
              </div>
              <div className="p-3">
                <p className="font-semibold text-[14px] text-foreground line-clamp-2 leading-snug">
                  {it.name}
                </p>
                {it.rating != null && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-white text-[11px] font-bold"
                      style={{ background: "hsl(25, 76%, 50%)" }}
                    >
                      {it.rating <= 5 ? `${it.rating.toFixed(1)}/5` : `${it.rating.toFixed(1)}/10`}
                    </span>
                    {it.reviewCount != null && it.reviewCount > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        {it.reviewCount} 則評論
                      </span>
                    )}
                  </div>
                )}
                {it.region && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground line-clamp-1">{it.region}</p>
                )}
                {it.price != null && it.price > 0 && (
                  <p
                    className="mt-2 font-bold text-[16px] tabular-nums"
                    style={{ color: "hsl(25, 76%, 50%)" }}
                  >
                    NT${it.price.toLocaleString()}
                    <span className="text-[11px] font-normal text-muted-foreground ml-1">起</span>
                  </p>
                )}
              </div>
            </Card>
          </button>
        ))}
      </div>
    </section>
  );
};

export default SimilarStaysCarousel;
