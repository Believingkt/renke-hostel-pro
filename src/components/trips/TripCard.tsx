/**
 * 共用行程卡片（/trips 列表與 AI 管家對話共用同一個元件）
 */
import { Link } from "react-router-dom";
import { Map } from "lucide-react";
import { MatchBadge } from "@/components/trips/MatchBadge";
import { pickLang, tripText, type TripLang } from "@/lib/tripI18n";

export interface TripCardData {
  trip_id: string;
  title: unknown;
  cover_image_url?: string | null;
  match_score?: number | null;
  spot_count: number;
  days?: number | null;
  total_price: number;
  trip_url?: string | null;
}

export function durationLabel(days: number | null | undefined, lang: TripLang): string {
  const d = Math.max(1, Number(days) || 1);
  if (lang === "ja") return `${d}日間`;
  if (lang === "en") return d === 1 ? "1 day" : `${d} days`;
  const zh = ["", "一", "二", "三", "四", "五", "六", "七"][d] || String(d);
  return `${zh}日`;
}

export function TripCard({
  trip,
  lang,
  cta,
}: {
  trip: TripCardData;
  lang: TripLang;
  cta?: string;
}) {
  const t = tripText(lang);
  const cover = typeof trip.cover_image_url === "string" ? trip.cover_image_url.trim() : "";
  const base = trip.trip_url || `/trips/${trip.trip_id}`;
  const to = `${base}${base.includes("?") ? "&" : "?"}lang=${lang}`;

  return (
    <Link
      to={to}
      className="block overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-transform active:scale-[0.99]"
    >
      {cover ? (
        <img
          src={cover}
          alt={pickLang(trip.title, lang)}
          loading="lazy"
          className="h-44 w-full object-cover"
        />
      ) : (
        <div className="flex h-28 w-full items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5">
          <Map className="h-7 w-7 text-primary/60" />
        </div>
      )}
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-bold text-foreground">{pickLang(trip.title, lang)}</h3>
          {trip.match_score != null && <MatchBadge score={trip.match_score} label={t.match} />}
        </div>
        <p className="text-xs text-muted-foreground">
          {t.spots(trip.spot_count)}
          {trip.days ? ` · ${durationLabel(trip.days, lang)}` : ""}
        </p>
        <div className="flex items-baseline justify-between pt-1">
          <span className="text-xs text-muted-foreground">{t.total}</span>
          <span className="text-lg font-bold text-primary tabular-nums">
            NT$ {Number(trip.total_price || 0).toLocaleString()}
          </span>
        </div>
        {cta && (
          <div className="pt-1">
            <span className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
              {cta}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
