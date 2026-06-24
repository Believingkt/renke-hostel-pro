import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

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
}

/**
 * 鄰近住宿：
 * - 僅顯示同 region_1 的物業
 * - 價格取「最接近搜尋人數」的啟用方案 sale_price (fallback original_price)
 * - 搜不到方案 → 不顯示價格（不顯示 NT$0）
 */
const SimilarStaysCarousel = ({ excludeId, region, adults = 2 }: Props) => {
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

      const [{ data: packages }, { data: photos }] = await Promise.all([
        (supabase.from("accommodation_packages") as any)
          .select("accommodation_id, guest_count, guest_count_max, sale_price, original_price, enabled")
          .in("accommodation_id", ids)
          .eq("enabled", true),
        (supabase.from("portal_featured_card_photos") as any)
          .select("accommodation_id, photo_url, display_order")
          .in("accommodation_id", ids)
          .order("display_order", { ascending: true }),
      ]);

      // 挑最接近 adults 的方案價格
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
        // 從候選中取「人數最接近 adults」者，價格 = sale_price || original_price
        let best: { dist: number; price: number | null } | null = null;
        candidates.forEach((p) => {
          const gc = p.guest_count ?? p.guest_count_max ?? 0;
          const dist = Math.abs(gc - adults);
          const price =
            p.sale_price != null && Number(p.sale_price) > 0
              ? Number(p.sale_price)
              : p.original_price != null && Number(p.original_price) > 0
                ? Number(p.original_price)
                : null;
          if (price == null) return;
          if (!best || dist < best.dist || (dist === best.dist && price < (best.price ?? Infinity))) {
            best = { dist, price };
          }
        });
        if (best?.price != null) priceMap.set(accId, best.price);
      });

      const coverMap = new Map<string, string>();
      (photos || []).forEach((p: any) => {
        if (p.accommodation_id && !coverMap.has(p.accommodation_id) && p.photo_url) {
          coverMap.set(p.accommodation_id, p.photo_url);
        }
      });

      const list: Item[] = data.map((d: any) => {
        const cache = d.google_reviews_cache as any;
        return {
          id: d.id,
          name: d.name,
          cover: coverMap.get(d.id) || d.og_image_url || null,
          rating: typeof cache?.rating === "number" ? cache.rating : null,
          reviewCount: typeof cache?.totalReviews === "number" ? cache.totalReviews : null,
          price: priceMap.get(d.id) ?? null,
          region: d.region_1 || null,
        };
      });

      setItems(list.slice(0, 8));
    })();
    return () => {
      cancelled = true;
    };
  }, [excludeId, region, adults]);

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
