/**
 * AI 回覆中的 [TRIP_CARDS] 區塊解析與渲染（沿用 /trips 的 TripCard 元件）
 */
import { useSearchParams } from "react-router-dom";
import { TripCard, type TripCardData } from "@lakeze/shared/components/trips/TripCard";
import { TripCardActions } from "@lakeze/shared/components/trips/TripCardActions";
import { normalizeLang, type TripLang } from "@lakeze/shared/lib/tripI18n";
import { emitMetric } from "@lakeze/shared/lib/metric";

const OPEN_TAG = "[TRIP_CARDS]";
const CLOSE_TAG = "[/TRIP_CARDS]";

const CTA: Record<TripLang, string> = {
  zh: "查看完整行程",
  ja: "旅程の詳細を見る",
  en: "View full itinerary",
};

/**
 * 解析 [TRIP_CARDS]...[/TRIP_CARDS]。
 * 串流途中只收到開頭標籤時，隱藏未完成片段，不讓原始 JSON 露出。
 */
export function parseTripCards(raw: string): { text: string; trips: TripCardData[] } {
  let text = raw;
  const trips: TripCardData[] = [];

  for (;;) {
    const start = text.indexOf(OPEN_TAG);
    if (start === -1) break;
    const end = text.indexOf(CLOSE_TAG, start);
    if (end === -1) {
      text = text.slice(0, start);
      break;
    }
    const json = text.slice(start + OPEN_TAG.length, end).trim();
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        for (const c of parsed) {
          if (c && typeof c.trip_id === "string") trips.push(c as TripCardData);
        }
      }
    } catch {
      /* 解析失敗就當作沒有卡片 */
    }
    text = text.slice(0, start) + text.slice(end + CLOSE_TAG.length);
  }

  return { text: text.trim(), trips };
}

export function TripCardList({ trips, accommodationId }: { trips: TripCardData[]; accommodationId?: string | null }) {
  const [params] = useSearchParams();
  const lang = normalizeLang(params.get("lang"));

  if (!trips.length) return null;

  // M1 分子：AI 對話中的行程卡被點開（帶 rec_id 一一對應該次曝光）
  const onOpen = (trip: TripCardData) =>
    emitMetric({ event_type: "trip_rec_click", ref_type: "trip", ref_id: trip.trip_id, accommodation_id: accommodationId ?? null, metadata: { source: "ai_chat", rec_id: trip.rec_id ?? null } });

  return (
    <div className="mt-3 space-y-3">
      {trips.map((trip) => (
        <TripCard
          key={trip.trip_id}
          trip={trip}
          lang={lang}
          cta={CTA[lang]}
          onOpen={onOpen}
          actions={
            <TripCardActions
              tripId={trip.trip_id}
              accommodationId={accommodationId ?? null}
              recId={trip.rec_id ?? null}
              lang={lang}
              title={trip.title}
              tripUrl={trip.trip_url}
            />
          }
        />
      ))}
    </div>
  );
}
