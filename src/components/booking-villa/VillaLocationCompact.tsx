import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Copy, Maximize2, Check, Train, MapPin, Utensils, ShoppingBag } from "lucide-react";
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

type TabKey = "transport" | "landmark" | "food" | "shop";

const TABS: { key: TabKey; label: string; icon: typeof Train }[] = [
  { key: "transport", label: "交通", icon: Train },
  { key: "landmark", label: "熱門地標", icon: MapPin },
  { key: "food", label: "餐點", icon: Utensils },
  { key: "shop", label: "購物", icon: ShoppingBag },
];

const FOOD_KW = ["餐", "食", "夜市", "咖啡", "cafe", "restaurant", "市場"];
const SHOP_KW = ["商店", "百貨", "outlet", "shopping", "購物", "mall"];
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
      : tab === "food"
        ? attractions.filter((a) => has(a, FOOD_KW))
        : tab === "shop"
          ? attractions.filter((a) => has(a, SHOP_KW))
          : attractions.filter(
              (a) => !has(a, TRANSPORT_KW) && !has(a, FOOD_KW) && !has(a, SHOP_KW)
            );

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
      <h2 className="text-[20px] font-bold text-foreground mb-2">位置</h2>
      {rating != null && (
        <p className="mb-3 text-[14px]">
          <span className="font-bold" style={{ color: "hsl(25, 76%, 50%)" }}>
            {rating.toFixed(1)}/10
          </span>{" "}
          <span className="text-foreground/80">位置絕佳</span>
        </p>
      )}

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

      {/* List */}
      {filtered.length > 0 ? (
        <ul className="divide-y divide-border/60">
          {filtered.slice(0, 8).map((a, i) => {
            const Icon = TABS.find((t) => t.key === tab)?.icon || MapPin;
            return (
              <li key={i} className="py-2.5 flex items-center gap-3">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-[13px] text-foreground/90 line-clamp-1">
                  {a.name}
                  {a.description && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">
                      {a.description.length > 10 ? "" : a.description}
                    </span>
                  )}
                </span>
                <span className="text-[13px] text-foreground/80 tabular-nums shrink-0">
                  {a.distance}
                </span>
              </li>
            );
          })}
        </ul>
      ) : tab === "transport" && (locationInfo?.driving_info || locationInfo?.public_transport_info) ? (
        <div className="space-y-2 text-[12px] text-muted-foreground leading-relaxed">
          {locationInfo?.public_transport_info && (
            <p className="whitespace-pre-line">{locationInfo.public_transport_info}</p>
          )}
          {locationInfo?.driving_info && (
            <p className="whitespace-pre-line">{locationInfo.driving_info}</p>
          )}
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground py-2">暫無相關資訊</p>
      )}
    </section>
  );
};

export default VillaLocationCompact;
