/**
 * 「台灣旅圖」有房卡（參數化佔位連結，日後替換真 API）。
 */
import { ExternalLink } from "lucide-react";
import { buildLvtuBookingUrl } from "@/config/lvtu";
import { tripText, type TripLang } from "@/lib/tripI18n";

interface Props {
  lang: TripLang;
  accommodationId: string | null;
  accommodationName: string;
  roomTypeName: string;
  checkinDate: string;
  available: number | null;
  blocked?: boolean;
}

export function LvtuBookingCard({
  lang,
  accommodationId,
  accommodationName,
  roomTypeName,
  checkinDate,
  available,
  blocked,
}: Props) {
  const t = tripText(lang);
  const soldOut = blocked || (available ?? 0) <= 0;
  const url = buildLvtuBookingUrl(accommodationId, checkinDate);

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary">{t.lvtuTitle}</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
            {accommodationName}・{roomTypeName}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {checkinDate}・
            {soldOut ? t.soldOut : available === null ? t.checking : t.remain(available)}
          </p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          {t.lvtuCta}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

export default LvtuBookingCard;
