import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { expandFacilitiesForAccommodations } from "@/lib/facility-merge";
import { CheckCircle2, Clock, MapPin, Phone } from "lucide-react";

interface Props {
  accommodationId: string;
  /** 團購頁自身已有的圖片數量，若已有大量圖片則不重複展示民宿相簿 */
  hideGallery?: boolean;
}

interface VenueInfo {
  name: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  check_in_notice: string | null;
  region_1: string | null;
  region_2: string | null;
}

/**
 * 團購頁的民宿基本介紹（取自訂房頁重點：簡介、地點、設施、入住須知）
 * 定位為「輔助資訊」，視覺權重低於團購方案。
 */
export function GroupBuyVenueIntro({ accommodationId, hideGallery }: Props) {
  const [info, setInfo] = useState<VenueInfo | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [facilities, setFacilities] = useState<string[]>([]);
  const [locationDesc, setLocationDesc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!accommodationId) return;
      const [infoRes, photoRes, facRes, locRes] = await Promise.all([
        supabase
          .from("accommodation_info")
          .select("name, description, address, phone, check_in_notice, region_1, region_2")
          .eq("id", accommodationId)
          .maybeSingle(),
        supabase
          .from("accommodation_photos")
          .select("photo_url, photo_type, display_order")
          .eq("accommodation_id", accommodationId)
          .order("display_order"),
        supabase
          .from("accommodation_facilities")
          .select("*")
          .is("room_scope", null)
          .or(`accommodation_id.is.null,accommodation_id.eq.${accommodationId}`),
        supabase
          .from("location_info")
          .select("location_description")
          .eq("accommodation_id", accommodationId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (infoRes.data) setInfo(infoRes.data as unknown as VenueInfo);
      setPhotos(
        (photoRes.data ?? [])
          .filter((p: any) => p.photo_type !== "hero")
          .map((p: any) => p.photo_url)
          .slice(0, 6),
      );
      setFacilities(
        expandFacilitiesForAccommodations((facRes.data ?? []) as any[], [accommodationId])
          .map((f: any) => f.facility_name)
          .filter(Boolean)
          .slice(0, 12),
      );
      setLocationDesc(locRes.data?.location_description ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  if (!info) return null;

  const region = [info.region_1, info.region_2].filter(Boolean).join("・");

  return (
    <section className="mt-6 rounded-xl border border-border/60 bg-muted/30 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">關於這間民宿</h2>
        <Badge variant="outline" className="text-xs">{info.name}</Badge>
        {region && <span className="text-xs text-muted-foreground">{region}</span>}
      </div>

      {info.description && (
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {info.description}
        </p>
      )}

      {!hideGallery && photos.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {photos.map((url) => (
            <img
              key={url}
              src={url}
              alt={info.name}
              loading="lazy"
              className="aspect-square w-full rounded-lg object-cover"
            />
          ))}
        </div>
      )}

      {facilities.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {facilities.map((f) => (
            <span
              key={f}
              className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-xs text-muted-foreground"
            >
              <CheckCircle2 className="h-3 w-3 text-primary" />
              {f}
            </span>
          ))}
        </div>
      )}

      <Separator className="my-4" />

      <div className="space-y-2 text-sm text-muted-foreground">
        {info.address && (
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info.address)}`}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              {info.address}
            </a>
          </p>
        )}
        {locationDesc && <p className="pl-6 whitespace-pre-line">{locationDesc}</p>}
        {info.phone && (
          <p className="flex items-center gap-2">
            <Phone className="h-4 w-4 flex-shrink-0 text-primary" />
            <a href={`tel:${info.phone}`} className="underline-offset-2 hover:underline">{info.phone}</a>
          </p>
        )}
        {info.check_in_notice && (
          <p className="flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
            <span className="whitespace-pre-line">{info.check_in_notice}</span>
          </p>
        )}
      </div>
    </section>
  );
}

export default GroupBuyVenueIntro;
