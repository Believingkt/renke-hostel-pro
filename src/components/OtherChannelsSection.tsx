import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink, Loader2 } from "lucide-react";

interface ExternalRoom {
  code: string;
  name: string;
  rateName?: string;
  maxOccupancy?: number;
  bookingUrl?: string;
  totalPrice?: { afterTax?: number; beforeTax?: number; currency?: string } | null;
  photos?: string[];
}

interface ExternalHotel {
  hotelCode: string;
  name: string;
  bookingUrl?: string;
  rooms: ExternalRoom[];
}

interface Props {
  accommodationId: string;
}

export default function OtherChannelsSection({ accommodationId }: Props) {
  const [searchParams] = useSearchParams();
  const [hotels, setHotels] = useState<ExternalHotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");

  useEffect(() => {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 86400000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const ci = searchParams.get("checkIn") || fmt(today);
    const co = searchParams.get("checkOut") || fmt(tomorrow);
    setCheckIn(ci);
    setCheckOut(co);

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.functions.invoke("search-external-rooms", {
        body: { accommodationId, checkIn: ci, checkOut: co },
      });
      if (cancelled) return;
      if (error || !data?.success) {
        setHotels([]);
      } else {
        setHotels(data.hotels || []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId, searchParams]);

  // Hide entire section if no data (per project standard)
  if (loading) return null;
  const allRooms = hotels.flatMap((h) => h.rooms.map((r) => ({ hotel: h, room: r })));
  if (allRooms.length === 0) return null;

  return (
    <section className="py-12 px-4 bg-muted/30">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">其他訂房通路</h2>
          <p className="text-sm text-muted-foreground">
            {checkIn} → {checkOut} · 透過台灣旅圖比對其他平台價格
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allRooms.map(({ hotel, room }) => {
            const price = room.totalPrice?.afterTax ?? room.totalPrice?.beforeTax;
            const currency = room.totalPrice?.currency || "TWD";
            const url = room.bookingUrl || hotel.bookingUrl;
            const photo = room.photos?.[0];
            return (
              <Card key={`${hotel.hotelCode}-${room.code}`} className="overflow-hidden flex flex-col">
                {photo && (
                  <div className="aspect-[4/3] bg-muted overflow-hidden">
                    <img src={photo} alt={room.name} loading="lazy" className="w-full h-full object-cover" />
                  </div>
                )}
                <CardContent className="p-4 flex-1 flex flex-col gap-2">
                  <div className="text-xs text-muted-foreground">{hotel.name}</div>
                  <h3 className="font-semibold text-base line-clamp-2">{room.name}</h3>
                  {room.rateName && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{room.rateName}</p>
                  )}
                  {room.maxOccupancy && (
                    <p className="text-xs text-muted-foreground">最多 {room.maxOccupancy} 人</p>
                  )}
                  <div className="mt-auto pt-2 flex items-end justify-between gap-2">
                    {price !== undefined && price !== null ? (
                      <div>
                        <div className="text-xs text-muted-foreground">總價</div>
                        <div className="text-lg font-bold text-primary tabular-nums">
                          {currency} {Number(price).toLocaleString()}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">價格洽通路</div>
                    )}
                    {url && (
                      <Button size="sm" asChild>
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          前往訂房 <ExternalLink className="h-3.5 w-3.5 ml-1" />
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
