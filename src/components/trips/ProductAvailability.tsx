/**
 * 行程品項的「可用時段 + 即時庫存 + 同步狀態」顯示。
 * 資料來源：trip_products.available_slots / stock / updated_at（不另建庫存邏輯）。
 */
import { Clock, RefreshCw } from "lucide-react";
import { StockTag } from "./StockTag";
import { tripText, type TripLang } from "@/lib/tripI18n";

export interface ProductStockInfo {
  stock: number | null;
  availableSlots: string[];
  updatedAt: string | null;
}

/** 從 jsonb available_slots 取出可顯示的時段字串 */
export function parseSlots(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .flatMap((v) => (Array.isArray(v) ? v.map(String) : [String(v)]))
      .filter(Boolean);
  }
  return [String(value)];
}

export function formatSyncedAt(iso: string | null, lang: TripLang): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(lang === "ja" ? "ja-JP" : lang === "en" ? "en-US" : "zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ProductAvailability({
  info,
  lang,
  compact,
}: {
  info: ProductStockInfo;
  lang: TripLang;
  compact?: boolean;
}) {
  const t = tripText(lang);
  const synced = formatSyncedAt(info.updatedAt, lang);

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      {info.availableSlots.length > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {info.availableSlots.join("、")}
        </span>
      )}
      <StockTag
        available={info.stock}
        loading={info.stock === null}
        texts={{ remain: t.remainStock, soldOut: t.soldOutProduct, checking: t.checking }}
      />
      {!compact && synced && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <RefreshCw className="h-3 w-3" />
          {t.syncedAt(synced)}
        </span>
      )}
    </div>
  );
}

export default ProductAvailability;
