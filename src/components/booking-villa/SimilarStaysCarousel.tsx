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
  base_price: number | null;
  region: string | null;
}

interface Props {
  excludeId: string;
  region?: string | null;
}

const SimilarStaysCarousel = ({ excludeId, region }: Props) => {
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase
        .from("accommodation_info") as any)
        .select("id, name, region_1, region_2, google_reviews_cache")
        .neq("id", excludeId)
        .limit(8);
      if (cancelled || !data) return;

      const ids: string[] = data.map((d: any) => d.id);

      const [{ data: rooms }, { data: photos }] = await Promise.all([
        (supabase.from("room_types") as any)
          .select("accommodation_id, base_price")
          .in("accommodation_id", ids),
        (supabase.from("accommodation_photos") as any)
          .select("accommodation_id, photo_url, order_index")
          .in("accommodation_id", ids)
          .order("order_index", { ascending: true }),
      ]);

      const priceMap = new Map<string, number>();
      (rooms || []).forEach((r: any) => {
        const cur = priceMap.get(r.accommodation_id);
        if (r.base_price != null && (cur == null || r.base_price < cur)) {
          priceMap.set(r.accommodation_id, r.base_price);
        }
      });

      const coverMap = new Map<string, string>();
      (photos || []).forEach((p: any) => {
        if (p.accommodation_id && !coverMap.has(p.accommodation_id)) {
          coverMap.set(p.accommodation_id, p.photo_url);
        }
      });

      const list: Item[] = data.map((d: any) => {
        const cache = d.google_reviews_cache as any;
        return {
          id: d.id,
          name: d.name,
          cover: coverMap.get(d.id) || null,
          rating: typeof cache?.rating === "number" ? cache.rating : null,
          reviewCount: typeof cache?.totalReviews === "number" ? cache.totalReviews : null,
          base_price: priceMap.get(d.id) ?? null,
          region: d.region_1 || null,
        };
      });

      const same = region ? list.filter((i) => i.region === region) : [];
      const other = list.filter((i) => !same.includes(i));
      setItems([...same, ...other].slice(0, 6));
    })();
    return () => {
      cancelled = true;
    };
  }, [excludeId, region]);

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
                      style={{ background: "hsl(217, 96%, 57%)" }}
                    >
                      {it.rating.toFixed(1)}/10
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
                {it.base_price != null && (
                  <p
                    className="mt-2 font-bold text-[16px] tabular-nums"
                    style={{ color: "hsl(217, 96%, 57%)" }}
                  >
                    NT${it.base_price.toLocaleString()}
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
