import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Copy, Maximize2, Check, Train, MapPin, Car, Bus } from "lucide-react";
import { toast } from "sonner";

interface Attraction {
  name: string;
  distance: string;
  description?: string;
  image_url?: string;
}

interface Props {
  address: string;
  locationInfo?: {
    location_description?: string;
    driving_info?: string;
    public_transport_info?: string;
    nearby_attractions?: Attraction[];
  };
  rating?: number | null;
}

type TabKey = "transport" | "landmark";

const TABS: { key: TabKey; label: string; icon: typeof Train }[] = [
  { key: "transport", label: "交通", icon: Train },
  { key: "landmark", label: "週邊景點", icon: MapPin },
];

const TRANSPORT_KW = ["車站", "火車", "高鐵", "客運", "捷運", "機場", "轉運", "station"];

const VillaLocationCompact = ({ address, locationInfo, rating }: Props) => {
  const [tab, setTab] = useState<TabKey>("transport");
  const [copied, setCopied] = useState(false);

  const hasAny =
    !!address ||
    !!locationInfo?.location_description ||
    !!locationInfo?.driving_info ||
    !!locationInfo?.public_transport_info ||
    (locationInfo?.nearby_attractions?.length || 0) > 0;
  if (!hasAny) return null;

  const attractions = locationInfo?.nearby_attractions || [];
  const has = (a: Attraction, kws: string[]) =>
    kws.some((k) => a.name.toLowerCase().includes(k.toLowerCase()));

  const filtered =
    tab === "transport"
      ? attractions.filter((a) => has(a, TRANSPORT_KW))
      : attractions.filter((a) => !has(a, TRANSPORT_KW));


  const handleCopy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast.success("地址已複製");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("複製失敗");
    }
  };

  return (
    <section id="location" className="px-4 py-5 bg-background">
      <h2 className="text-[20px] font-bold text-foreground mb-3">交通建議</h2>


      {/* Map */}
      <Card className="overflow-hidden border-border/60 mb-3">
        <div className="relative h-[180px] bg-muted">
          {address && (
            <iframe
              title="map"
              src={`https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
              className="w-full h-full border-0"
              loading="lazy"
            />
          )}
          <a
            href={`https://www.google.com/maps?q=${encodeURIComponent(address || "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center"
            aria-label="放大地圖"
          >
            <Maximize2 className="h-4 w-4 text-foreground" />
          </a>
        </div>
      </Card>

      {/* Address */}
      {address && (
        <button
          onClick={handleCopy}
          className="w-full text-left mb-3 flex items-center justify-between gap-2 text-[13px] text-foreground/85"
        >
          <span className="line-clamp-2">{address}</span>
          {copied ? (
            <Check className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-none -mx-1 px-1">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="shrink-0 px-3 py-1.5 rounded-md border text-[13px] font-medium transition"
              style={{
                borderColor: active ? "hsl(25, 76%, 50%)" : "hsl(0, 0%, 88%)",
                color: active ? "hsl(25, 76%, 50%)" : "hsl(0, 0%, 30%)",
                background: active ? "hsl(25, 76%, 96%)" : "transparent",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {tab === "transport" ? (
        <div className="space-y-4">
          {/* 大眾運輸 */}
          {(locationInfo?.public_transport_info || filtered.length > 0) && (
            <div className="rounded-lg border border-border/60 bg-card p-3">
              <div className="flex items-center gap-2 mb-2">
                <Bus className="h-4 w-4" style={{ color: "hsl(25, 76%, 50%)" }} />
                <h3 className="text-[14px] font-semibold text-foreground">大眾運輸</h3>
              </div>
              {filtered.length > 0 && (
                <ul className="divide-y divide-border/60 mb-2">
                  {filtered.slice(0, 8).map((a, i) => (
                    <li key={i} className="py-2 flex items-center gap-3">
                      <Train className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 text-[13px] text-foreground/90 line-clamp-1">
                        {a.name}
                      </span>
                      <span className="text-[13px] text-foreground/80 tabular-nums shrink-0">
                        {a.distance}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {locationInfo?.public_transport_info && (
                <div
                  className="text-[13px] text-foreground/85 leading-relaxed [&_strong]:font-semibold [&_strong]:text-foreground [&_p]:mb-1 [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: locationInfo.public_transport_info }}
                />
              )}
            </div>
          )}

          {/* 自行開車 */}
          {locationInfo?.driving_info && (
            <div className="rounded-lg border border-border/60 bg-card p-3">
              <div className="flex items-center gap-2 mb-2">
                <Car className="h-4 w-4" style={{ color: "hsl(25, 76%, 50%)" }} />
                <h3 className="text-[14px] font-semibold text-foreground">自行開車</h3>
              </div>
              <div
                className="text-[13px] text-foreground/85 leading-relaxed [&_strong]:font-semibold [&_strong]:text-foreground [&_p]:mb-1 [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: locationInfo.driving_info }}
              />
            </div>
          )}

          {filtered.length === 0 &&
            !locationInfo?.public_transport_info &&
            !locationInfo?.driving_info && (
              <p className="text-[12px] text-muted-foreground py-2">暫無相關資訊</p>
            )}
        </div>
          {filtered.length === 0 &&
            !locationInfo?.public_transport_info &&
            !locationInfo?.driving_info && (
              <p className="text-[12px] text-muted-foreground py-2">暫無相關資訊</p>
            )}
        </div>
      ) : filtered.length > 0 ? (
        <ul className="space-y-3">
          {filtered.map((a, i) => (
            <li
              key={i}
              className="flex gap-3 p-2 rounded-lg border border-border/60 bg-card"
            >
              {a.image_url ? (
                <img
                  src={a.image_url}
                  alt={a.name}
                  loading="lazy"
                  className="w-20 h-20 rounded-md object-cover shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-md bg-muted flex items-center justify-center shrink-0">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[14px] font-medium text-foreground line-clamp-1">
                    {a.name}
                  </span>
                  {a.distance && (
                    <span className="text-[12px] text-foreground/70 tabular-nums shrink-0">
                      {a.distance}
                    </span>
                  )}
                </div>
                {a.description && (
                  <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed line-clamp-3">
                    {a.description}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-muted-foreground py-2">暫無相關資訊</p>
      )}
    </section>
  );
};

export default VillaLocationCompact;
