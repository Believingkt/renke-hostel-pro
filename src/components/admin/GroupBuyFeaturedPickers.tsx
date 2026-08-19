import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { expandFacilitiesForAccommodations } from "@/lib/facility-merge";
import { Check } from "lucide-react";

/**
 * 團購頁精選特色：只能從該民宿「既有設施資料」勾選，不允許自由輸入。
 * 儲存格式維持 text[]（設施名稱），與既有 featured_facilities 資料相容，不需 migration。
 */
export function FeaturedFacilityPicker({
  accommodationId,
  value,
  onChange,
  max = 6,
}: {
  accommodationId: string;
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!accommodationId) return;
      const { data } = await supabase
        .from("accommodation_facilities")
        .select("*")
        .or(`accommodation_id.is.null,accommodation_id.eq.${accommodationId}`);
      if (cancelled) return;
      const merged = expandFacilitiesForAccommodations((data ?? []) as any[], [accommodationId]);
      const uniq = Array.from(
        new Set(merged.map((f: any) => String(f.facility_name || "").trim()).filter(Boolean)),
      );
      setNames(uniq);
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  const selected = useMemo(() => new Set(value), [value]);
  const toggle = (name: string) => {
    if (selected.has(name)) {
      onChange(value.filter((v) => v !== name));
    } else if (value.length < max) {
      onChange([...value, name]);
    }
  };

  return (
    <div>
      <Label>團購頁精選特色（從既有設施勾選，最多 {max} 項；未勾選時自動取民宿設施）</Label>
      <div className="mt-2 max-h-56 overflow-y-auto rounded-md border p-3">
        {names.length === 0 ? (
          <p className="text-sm text-muted-foreground">此民宿尚未建立設施資料。</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {names.map((n) => {
              const on = selected.has(n);
              return (
                <label key={n} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={on}
                    disabled={!on && value.length >= max}
                    onCheckedChange={() => toggle(n)}
                  />
                  <span className="truncate">{n}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        已選 {value.length} / {max}
      </p>
    </div>
  );
}

/**
 * 首屏精選照片：從該民宿既有相簿勾選（保存既有照片網址，不重新上傳）。
 */
export function FeaturedPhotoPicker({
  accommodationId,
  value,
  onChange,
  max = 4,
}: {
  accommodationId: string;
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!accommodationId) return;
      const { data } = await supabase
        .from("accommodation_photos")
        .select("id, photo_url, display_order")
        .eq("accommodation_id", accommodationId)
        .order("display_order");
      if (cancelled) return;
      setPhotos(
        (data ?? [])
          .map((p: any) => ({ id: p.id as string, url: p.photo_url as string }))
          .filter((p) => !!p.url),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  const selected = useMemo(() => new Set(value), [value]);
  const toggle = (url: string) => {
    if (selected.has(url)) onChange(value.filter((v) => v !== url));
    else if (value.length < max) onChange([...value, url]);
  };

  return (
    <div>
      <Label>首屏精選照片（從民宿相簿勾選，最多 {max} 張；未勾選時自動取民宿相簿）</Label>
      <div className="mt-2 max-h-64 overflow-y-auto rounded-md border p-3">
        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">此民宿尚未上傳相簿照片。</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
            {photos.map((p) => {
              const on = selected.has(p.url);
              const disabled = !on && value.length >= max;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.url)}
                  disabled={disabled}
                  className={`relative aspect-[4/3] overflow-hidden rounded-md border-2 transition ${
                    on ? "border-primary" : "border-transparent"
                  } ${disabled ? "opacity-40" : ""}`}
                >
                  <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  {on && (
                    <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        已選 {value.length} / {max}
      </p>
    </div>
  );
}
