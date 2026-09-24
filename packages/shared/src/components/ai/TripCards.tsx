/**
 * AI 回覆中的 [TRIP_CARDS] 區塊解析與渲染（沿用 /trips 的 TripCard 元件）
 */
import { useSearchParams } from "react-router-dom";
import { TripCard, type TripCardData } from "@lakeze/shared/components/trips/TripCard";
import { normalizeLang, type TripLang } from "@lakeze/shared/lib/tripI18n";

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

export function TripCardList({ trips }: { trips: TripCardData[] }) {
  const [params] = useSearchParams();
  const lang = normalizeLang(params.get("lang"));

  if (!trips.length) return null;

  return (
    <div className="mt-3 space-y-3">
      {trips.map((trip) => (
        <TripCard key={trip.trip_id} trip={trip} lang={lang} cta={CTA[lang]} />
      ))}
    </div>
  );
}
