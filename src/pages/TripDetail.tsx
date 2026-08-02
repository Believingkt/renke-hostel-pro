/**
 * /trips/:tripId — 行程詳情（含三語切換、時間軸、住宿即時房況、底部總價列）
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Pencil } from "lucide-react";
import { writeCart, type CartItem } from "@/lib/tripCart";
import { supabase } from "@/integrations/supabase/client";
import { LangSwitch } from "@/components/trips/LangSwitch";
import { MatchBadge } from "@/components/trips/MatchBadge";
import { StockTag } from "@/components/trips/StockTag";
import { TimelineItem, type TimelineItemType } from "@/components/trips/TimelineItem";
import { PriceBar } from "@/components/trips/PriceBar";
import { normalizeLang, pickLang, tripText, type TripLang } from "@/lib/tripI18n";
import { fetchRoomAvailability, type RoomAvailability } from "@/lib/tripAvailability";

interface TripItem {
  ref_type: "product" | "room";
  ref_id: string;
  qty?: number;
  day?: number;
  order?: number;
  slot?: string;
  start_time?: string;
}

interface TripRow {
  id: string;
  title: unknown;
  cover_url: string | null;
  scenario: string | null;
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
}

/** 房況查詢基準日：預設查一週後（Phase 2 接購物車後改用使用者選擇的入住日） */
function defaultStayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
}

export default function TripDetail() {
  const { tripId } = useParams<{ tripId: string }>();
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
    return [...raw].sort(
      (a, b) => (a.day ?? 1) - (b.day ?? 1) || (a.order ?? 0) - (b.order ?? 0),
    );
  }, [trip]);

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("trips")
        .select("id, title, cover_url, scenario, match_score, items, total_price")
        .eq("id", tripId)
        .maybeSingle();
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
          .select("id, type, name, description, price, duration_min")
          .in("id", productIds);
        if (cancelled) return;
        const map: Record<string, ProductRow> = {};
        for (const p of (prods as ProductRow[]) || []) map[p.id] = p;
        setProducts(map);
      }

      const roomIds = [
        ...new Set(list.filter((i) => i.ref_type === "room").map((i) => i.ref_id)),
      ];
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
  }, [tripId]);

  const setLang = (next: TripLang) => {
    const p = new URLSearchParams(params);
    p.set("lang", next);
    setParams(p, { replace: true });
  };

  const totalMinutes = useMemo(
    () =>
      items.reduce((sum, item) => {
        if (item.ref_type !== "product") return sum;
        return sum + (products[item.ref_id]?.duration_min ?? 0);
      }, 0),
    [items, products],
  );

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

  const groupedDays = [...new Set(items.map((i) => i.day ?? 1))].sort((a, b) => a - b);

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* 頂部封面 */}
      <div className="relative">
        {trip.cover_url && (
          <img
            src={trip.cover_url}
            alt={pickLang(trip.title, lang)}
            className="h-52 w-full object-cover"
          />
        )}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
          <Link
            to={`/trips?lang=${lang}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/85 backdrop-blur"
            aria-label={t.back}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <LangSwitch value={lang} onChange={setLang} />
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-bold text-foreground">{pickLang(trip.title, lang)}</h1>
          {trip.match_score != null && <MatchBadge score={trip.match_score} label={t.match} />}
        </div>
        {totalMinutes > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t.totalDuration((totalMinutes / 60).toFixed(1))}
          </p>
        )}

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
                          title={
                            room
                              ? `${room.accommodationName}・${room.roomTypeName}`
                              : t.stayLabel
                          }
                          subtitle={t.stayLabel}
                          isLast={isLast}
                          draggable
                          trailing={
                            <StockTag
                              available={room ? room.available : null}
                              blocked={room?.blocked}
                              loading={roomsLoading || !room}
                              texts={{
                                remain: t.remain,
                                soldOut: t.soldOut,
                                checking: t.checking,
                              }}
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
                        price={Number(p.price || 0) * (item.qty || 1)}
                        isLast={isLast}
                        draggable
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <PriceBar
        label={t.total}
        amount={Number(trip.total_price || 0)}
        ctaLabel={t.cta}
        onCta={() => {
          const stayDate = defaultStayDate();
          const nextDay = new Date(stayDate);
          nextDay.setDate(nextDay.getDate() + 1);
          const checkOut = nextDay.toISOString().split("T")[0];
          const cartItems: CartItem[] = [];
          for (const item of items) {
            if (item.ref_type === "room") {
              const room = rooms[item.ref_id];
              if (!room) continue;
              cartItems.push({
                kind: "stay",
                key: `s-${room.roomTypeId}-${stayDate}`,
                roomTypeId: room.roomTypeId,
                accommodationId: room.accommodationId,
                roomName: room.roomTypeName,
                accommodationName: room.accommodationName,
                checkIn: stayDate,
                checkOut,
                nights: 1,
                unitPrice: 0,
                qty: item.qty || 1,
              });
            } else {
              const p = products[item.ref_id];
              if (!p) continue;
              cartItems.push({
                kind: "product",
                key: `p-${p.id}`,
                productId: p.id,
                name: pickLang(p.name, lang),
                type: p.type,
                unitPrice: Number(p.price || 0),
                qty: item.qty || 1,
              });
            }
          }
          writeCart({ tripId: trip.id, items: cartItems });
          navigate(`/cart?lang=${lang}`);
        }}
      />
    </div>
  );
}
