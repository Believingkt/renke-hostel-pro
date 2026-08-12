import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, Users, Maximize2, BedDouble } from "lucide-react";

export interface GroupBuyRoomType {
  id: string;
  name: string;
  description: string | null;
  capacity: number | null;
  size_sqm: number | null;
  photo_url: string | null;
}

interface AccInfo {
  name: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  check_in_notice: string | null;
}

/** 團購頁的民宿基本介紹（名稱、簡介、地址、電話 + 環境照） */
export function AccommodationIntro({ accommodationId }: { accommodationId: string }) {
  const [info, setInfo] = useState<AccInfo | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [infoRes, photoRes] = await Promise.all([
        supabase
          .from("accommodation_info")
          .select("name, description, address, phone, check_in_notice")
          .eq("id", accommodationId)
          .maybeSingle(),
        supabase
          .from("accommodation_photos")
          .select("photo_url, photo_type, display_order")
          .eq("accommodation_id", accommodationId)
          .order("display_order")
          .limit(12),
      ]);
      if (cancelled) return;
      if (infoRes.data) setInfo(infoRes.data as AccInfo);
      setPhotos(((photoRes.data ?? []) as any[]).map((p) => p.photo_url).filter(Boolean).slice(0, 6));
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  if (!info) return null;

  const desc = info.description?.trim() || "";
  const isLong = desc.length > 120;

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-foreground">{info.name}</h2>
        <Badge variant="outline">民宿介紹</Badge>
      </div>

      {desc && (
        <p className={`mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground ${!expanded && isLong ? "line-clamp-3" : ""}`}>
          {desc}
        </p>
      )}
      {isLong && (
        <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "收合" : "展開完整介紹"}
        </Button>
      )}

      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
        {info.address && (
          <a
            className="flex items-start gap-2 hover:text-primary"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info.address)}`}
            target="_blank"
            rel="noreferrer"
          >
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{info.address}</span>
          </a>
        )}
        {info.phone && (
          <a className="flex items-center gap-2 hover:text-primary" href={`tel:${info.phone}`}>
            <Phone className="h-4 w-4 shrink-0" />
            <span>{info.phone}</span>
          </a>
        )}
      </div>

      {photos.length > 0 && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {photos.map((url) => (
            <img
              key={url}
              src={url}
              alt={info.name}
              loading="lazy"
              className="h-24 w-36 shrink-0 rounded-lg object-cover"
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** 團購方案對應房型的介紹 */
export function PackageRoomTypes({
  accommodationId,
  roomTypeIds,
}: {
  accommodationId: string;
  roomTypeIds: string[];
}) {
  const [rooms, setRooms] = useState<GroupBuyRoomType[]>([]);
  const key = useMemo(() => [...roomTypeIds].sort().join(","), [roomTypeIds]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (roomTypeIds.length === 0) {
        setRooms([]);
        return;
      }
      const { data } = await supabase
        .from("room_types")
        .select("id, name, description, capacity, size_sqm, room_photos (photo_url, display_order)")
        .eq("accommodation_id", accommodationId)
        .in("id", roomTypeIds)
        .order("display_order");
      if (cancelled) return;
      setRooms(
        ((data ?? []) as any[]).map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          capacity: r.capacity,
          size_sqm: r.size_sqm,
          photo_url:
            (r.room_photos ?? []).slice().sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))[0]
              ?.photo_url ?? null,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accommodationId, key]);

  if (rooms.length === 0) return null;

  return (
    <div className="mt-4 space-y-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <BedDouble className="h-4 w-4 text-primary" /> 此方案對應房型
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {rooms.map((r) => (
          <div key={r.id} className="flex gap-3 rounded-xl border bg-card p-3">
            {r.photo_url && (
              <img src={r.photo_url} alt={r.name} loading="lazy" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
            )}
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{r.name}</p>
              <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {r.capacity ? (
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> 可住 {r.capacity} 人
                  </span>
                ) : null}
                {r.size_sqm ? (
                  <span className="flex items-center gap-1">
                    <Maximize2 className="h-3.5 w-3.5" /> {r.size_sqm} 坪
                  </span>
                ) : null}
              </div>
              {r.description && (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{r.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
