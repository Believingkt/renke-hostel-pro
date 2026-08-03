/**
 * /trips/:slug/share — 公開唯讀分享頁。
 * 未登入可看（走 Phase 1 已設的公開唯讀 RLS：status='published' 或 share_slug 非空）。
 * 隱藏所有編輯／管理動作與加入購物車等價格敏感操作，只呈現行程內容與房況。
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LangSwitch } from "@/components/trips/LangSwitch";
import { MatchBadge } from "@/components/trips/MatchBadge";
import { StockTag } from "@/components/trips/StockTag";
import { TimelineItem, type TimelineItemType } from "@/components/trips/TimelineItem";
import { LvtuBookingCard } from "@/components/trips/LvtuBookingCard";
import { ProductAvailability, parseSlots } from "@/components/trips/ProductAvailability";
import { normalizeLang, pickLang, tripText, type TripLang } from "@/lib/tripI18n";
import { fetchRoomAvailability, type RoomAvailability } from "@/lib/tripAvailability";
import { SEOHead } from "@/components/SEOHead";

interface TripItem {
  ref_type: "product" | "room";
  ref_id: string;
  qty?: number;
  day?: number;
  order?: number;
  start_time?: string;
}

interface TripRow {
  id: string;
  title: unknown;
  cover_url: string | null;
  match_score: number | null;
  items: unknown;
  total_price: number | null;
}

interface ProductRow {
  id: string;
  type: string;
  name: unknown;
  description: unknown;
  price: number | null;
  duration_min: number | null;
  stock: number | null;
  available_slots: unknown;
  updated_at: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function defaultStayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
}

export default function TripShare() {
  const { slug } = useParams<{ slug: string }>();
  const [params, setParams] = useSearchParams();
  const lang = normalizeLang(params.get("lang")) as TripLang;
  const t = tripText(lang);

  const [trip, setTrip] = useState<TripRow | null>(null);
  const [products, setProducts] = useState<Record<string, ProductRow>>({});
  const [rooms, setRooms] = useState<Record<string, RoomAvailability | null>>({});
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const items: TripItem[] = useMemo(() => {
    const raw = Array.isArray(trip?.items) ? (trip!.items as TripItem[]) : [];
    return [...raw].sort((a, b) => (a.day ?? 1) - (b.day ?? 1) || (a.order ?? 0) - (b.order ?? 0));
  }, [trip]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      const select = "id, title, cover_url, match_score, items, total_price";
      const query = supabase.from("trips").select(select);
      const { data } = UUID_RE.test(slug)
        ? await query.eq("id", slug).maybeSingle()
        : await query.eq("share_slug", slug).maybeSingle();
      if (cancelled) return;
      setTrip((data as TripRow) || null);
      setLoaded(true);

      const list = Array.isArray((data as TripRow)?.items)
        ? ((data as TripRow).items as TripItem[])
        : [];

      const productIds = list.filter((i) => i.ref_type === "product").map((i) => i.ref_id);
      if (productIds.length) {
        const { data: prods } = await supabase
          .from("trip_products")
          .select(
            "id, type, name, description, price, duration_min, stock, available_slots, updated_at",
          )
          .in("id", productIds);
        if (cancelled) return;
        const map: Record<string, ProductRow> = {};
        for (const p of (prods as ProductRow[]) || []) map[p.id] = p;
        setProducts(map);
      }

      const roomIds = [...new Set(list.filter((i) => i.ref_type === "room").map((i) => i.ref_id))];
      if (roomIds.length) {
        setRoomsLoading(true);
        const stayDate = defaultStayDate();
        const results = await Promise.all(
          roomIds.map(async (id) => {
            try {
              return [id, await fetchRoomAvailability(id, stayDate)] as const;
            } catch {
              return [id, null] as const;
            }
          }),
        );
        if (cancelled) return;
        setRooms(Object.fromEntries(results));
        setRoomsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const setLang = (next: TripLang) => {
    const p = new URLSearchParams(params);
    p.set("lang", next);
    setParams(p, { replace: true });
  };

  if (!loaded) return null;

  if (!trip) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">{t.notFound}</p>
        <Link to={`/trips?lang=${lang}`} className="text-sm font-medium text-primary underline">
          {t.back}
        </Link>
      </div>
    );
  }

  const stayDate = defaultStayDate();
  const groupedDays = [...new Set(items.map((i) => i.day ?? 1))].sort((a, b) => a - b);
  const stayRooms = items
    .filter((i) => i.ref_type === "room")
    .map((i) => rooms[i.ref_id])
    .filter((r): r is RoomAvailability => !!r);

  return (
    <div className="min-h-screen bg-background pb-12">
      <SEOHead
        title={`${pickLang(trip.title, lang)}｜${t.tripsTitle}`}
        description={t.tripsSubtitle}
        image={trip.cover_url || undefined}
        type="article"
      />

      <div className="relative">
        {trip.cover_url && (
          <img
            src={trip.cover_url}
            alt={pickLang(trip.title, lang)}
            className="h-52 w-full object-cover"
          />
        )}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-background/85 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
            <Eye className="h-3.5 w-3.5" />
            {t.viewOnly}
          </span>
          <LangSwitch value={lang} onChange={setLang} />
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-bold text-foreground">{pickLang(trip.title, lang)}</h1>
          {trip.match_score != null && <MatchBadge score={trip.match_score} label={t.match} />}
        </div>

        <div className="mt-5 space-y-5">
          {groupedDays.map((day) => {
            const dayItems = items.filter((i) => (i.day ?? 1) === day);
            return (
              <section key={day}>
                <h2 className="mb-2 inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                  {t.day(day)}
                </h2>
                <div>
                  {dayItems.map((item, idx) => {
                    const isLast = idx === dayItems.length - 1;
                    if (item.ref_type === "room") {
                      const room = rooms[item.ref_id];
                      return (
                        <TimelineItem
                          key={`${item.ref_id}-${idx}`}
                          type="room"
                          time={item.start_time}
                          title={room ? `${room.accommodationName}・${room.roomTypeName}` : t.stayLabel}
                          subtitle={t.stayLabel}
                          isLast={isLast}
                          trailing={
                            <StockTag
                              available={room ? room.available : null}
                              blocked={room?.blocked}
                              loading={roomsLoading || !room}
                              texts={{ remain: t.remain, soldOut: t.soldOut, checking: t.checking }}
                            />
                          }
                        />
                      );
                    }
                    const p = products[item.ref_id];
                    if (!p) return null;
                    return (
                      <TimelineItem
                        key={`${item.ref_id}-${idx}`}
                        type={p.type as TimelineItemType}
                        time={item.start_time}
                        title={pickLang(p.name, lang)}
                        subtitle={pickLang(p.description, lang)}
                        durationMin={p.duration_min}
                        isLast={isLast}
                      >
                        <ProductAvailability
                          lang={lang}
                          info={{
                            stock: p.stock,
                            availableSlots: parseSlots(p.available_slots),
                            updatedAt: p.updated_at,
                          }}
                        />
                      </TimelineItem>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {stayRooms.length > 0 && (
          <div className="mt-6 space-y-2">
            {stayRooms.map((room) => (
              <LvtuBookingCard
                key={room.roomTypeId}
                lang={lang}
                accommodationId={room.accommodationId}
                accommodationName={room.accommodationName}
                roomTypeName={room.roomTypeName}
                checkinDate={stayDate}
                available={room.available}
                blocked={room.blocked}
              />
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <Link to={`/trips?lang=${lang}`} className="text-sm font-medium text-primary underline">
            {t.tripsTitle}
          </Link>
        </div>
      </div>
    </div>
  );
}
