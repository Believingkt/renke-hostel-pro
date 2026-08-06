import { useState } from "react";
import { BedDouble } from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface AiRoomCard {
  room_type_id?: string;
  name: string;
  image_url?: string | null;
  price?: number | null;
  available?: number | null;
  check_in?: string | null;
  check_out?: string | null;
  features?: string | null;
  accommodation_name?: string | null;
  booking_url?: string | null;
}

const OPEN_TAG = "[ROOM_CARDS]";
const CLOSE_TAG = "[/ROOM_CARDS]";

/**
 * 從 AI 回覆中解析 [ROOM_CARDS]...[/ROOM_CARDS] 區塊。
 * 串流途中若只收到開頭標籤（尚未收到結尾），會把該片段隱藏，不讓原始 JSON 露出。
 */
export function parseRoomCards(raw: string): { text: string; cards: AiRoomCard[] } {
  let text = raw;
  const cards: AiRoomCard[] = [];

  // 先取出所有完整區塊
  for (;;) {
    const start = text.indexOf(OPEN_TAG);
    if (start === -1) break;
    const end = text.indexOf(CLOSE_TAG, start);
    if (end === -1) {
      // 區塊尚未收完 → 隱藏未完成片段
      text = text.slice(0, start);
      break;
    }
    const json = text.slice(start + OPEN_TAG.length, end).trim();
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        for (const c of parsed) {
          if (c && typeof c.name === "string") cards.push(c as AiRoomCard);
        }
      }
    } catch {
      /* 解析失敗就當作沒有卡片 */
    }
    text = text.slice(0, start) + text.slice(end + CLOSE_TAG.length);
  }

  return { text: text.trim(), cards };
}

function RoomCardImage({ card }: { card: AiRoomCard }) {
  const valid = typeof card.image_url === "string" && /^https?:\/\//.test(card.image_url.trim());
  const [failed, setFailed] = useState(!valid);

  if (failed) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-primary/15 to-primary/5 px-3 text-center">
        <BedDouble className="w-6 h-6 text-primary/60" />
        <span className="text-[11px] font-medium text-primary/80 line-clamp-2">{card.name}</span>
      </div>
    );
  }

  return (
    <img
      src={card.image_url!.trim()}
      alt={card.name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-full h-full object-cover"
    />
  );
}

export function RoomCardList({ cards }: { cards: AiRoomCard[] }) {
  const navigate = useNavigate();
  if (!cards.length) return null;

  return (
    <div className="space-y-2.5 mt-2">
      {cards.map((c, i) => (
        <div
          key={c.room_type_id || i}
          className="rounded-xl overflow-hidden border border-border bg-background shadow-sm"
        >
          <div className="relative w-full h-32 bg-muted flex items-center justify-center">
            <RoomCardImage card={c} />
          </div>

          <div className="p-3 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {c.accommodation_name && (
                  <p className="text-[11px] text-muted-foreground truncate">{c.accommodation_name}</p>
                )}
                <p className="text-sm font-semibold text-foreground leading-snug">{c.name}</p>
              </div>
              {typeof c.available === "number" && c.available > 0 && (
                <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                  有房 {c.available} 間
                </span>
              )}
              {typeof c.available === "number" && c.available <= 0 && (
                <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                  已額滿
                </span>
              )}
            </div>

            {c.features && (
              <p className="text-[11px] text-muted-foreground leading-snug">{c.features}</p>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              {c.price ? (
                <p className="text-sm font-bold text-primary">
                  NT${Number(c.price).toLocaleString()}
                  <span className="text-[11px] font-normal text-muted-foreground"> /晚</span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">價格請洽詢</p>
              )}
              {c.booking_url && (
                <button
                  onClick={() => {
                    const url = c.booking_url!;
                    if (/^https?:\/\//.test(url)) window.open(url, "_blank");
                    else navigate(url);
                  }}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
                >
                  前往訂房
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
