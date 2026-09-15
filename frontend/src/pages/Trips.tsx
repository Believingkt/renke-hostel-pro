/**
 * /trips — 行程結果頁（行動優先）
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TripCard } from "@/components/trips/TripCard";
import { LangSwitch } from "@/components/trips/LangSwitch";
import { normalizeLang, tripText, type TripLang } from "@/lib/tripI18n";


interface TripRow {
  id: string;
  title: unknown;
  cover_url: string | null;
  scenario: string | null;
  match_score: number | null;
  items: unknown;
  total_price: number | null;
}

export default function Trips() {
  const [params, setParams] = useSearchParams();
  const lang = normalizeLang(params.get("lang")) as TripLang;
  const t = tripText(lang);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("trips")
        .select("id, title, cover_url, scenario, match_score, items, total_price")
        .eq("status", "published")
        .order("match_score", { ascending: false });
      if (cancelled) return;
      setTrips((data as TripRow[]) || []);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLang = (next: TripLang) => {
    const p = new URLSearchParams(params);
    p.set("lang", next);
    setParams(p, { replace: true });
  };

  const cards = useMemo(
    () =>
      trips.map((trip) => {
        const items = Array.isArray(trip.items) ? (trip.items as Array<{ ref_type?: string }>) : [];
        const spotCount = items.filter((i) => i.ref_type !== "room").length;
        return { trip, spotCount };
      }),
    [trips],
  );

  if (!loaded) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-foreground">{t.tripsTitle}</h1>
            <p className="truncate text-xs text-muted-foreground">{t.tripsSubtitle}</p>
          </div>
          <LangSwitch value={lang} onChange={setLang} />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        {cards.map(({ trip, spotCount }) => (
          <TripCard
            key={trip.id}
            lang={lang}
            trip={{
              trip_id: trip.id,
              title: trip.title,
              cover_image_url: trip.cover_url,
              match_score: trip.match_score,
              spot_count: spotCount,
              days: null,
              total_price: Number(trip.total_price || 0),
            }}
          />
        ))}
      </main>

    </div>
  );
}
