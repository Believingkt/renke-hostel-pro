import { useState } from "react";
import { Check, Plus } from "lucide-react";

export interface AiAddonCard {
  addon_type: string;
  name: string;
  price_per_unit: number;
  unit_label: string;
  pricing_mode: "per_night" | "per_stay";
  min?: number;
  max?: number;
}

const OPEN_TAG = "[ADDON_CARDS]";
const CLOSE_TAG = "[/ADDON_CARDS]";

/** 解析 [ADDON_CARDS]...[/ADDON_CARDS]；串流中未收完的片段先隱藏 */
export function parseAddonCards(raw: string): { text: string; addons: AiAddonCard[] } {
  let text = raw;
  const addons: AiAddonCard[] = [];
  for (;;) {
    const start = text.indexOf(OPEN_TAG);
    if (start === -1) break;
    const end = text.indexOf(CLOSE_TAG, start);
    if (end === -1) {
      text = text.slice(0, start);
      break;
    }
    try {
      const parsed = JSON.parse(text.slice(start + OPEN_TAG.length, end).trim());
      if (Array.isArray(parsed)) {
        for (const a of parsed) if (a && typeof a.addon_type === "string") addons.push(a as AiAddonCard);
      }
    } catch { /* 解析失敗視為無卡片 */ }
    text = text.slice(0, start) + text.slice(end + CLOSE_TAG.length);
  }
  return { text: text.trim(), addons };
}

const pickKey = (accId: string) => `ai_addon_pick:${accId}`;

export function readAddonPicks(accId: string): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(pickKey(accId)) || "{}") || {};
  } catch {
    return {};
  }
}

function writeAddonPicks(accId: string, picks: Record<string, number>) {
  try { sessionStorage.setItem(pickKey(accId), JSON.stringify(picks)); } catch { /* ignore */ }
}

/** 把小安帶入的加購附到 /book 連結（?addons=type:qty&addonSrc=web_ai） */
export function withAddonPicks(url: string, accId: string): string {
  const picks = Object.entries(readAddonPicks(accId)).filter(([, q]) => q > 0);
  if (!picks.length || !/^\/book(\?|$)/.test(url)) return url;
  const addons = picks.map(([t, q]) => `${encodeURIComponent(t)}:${q}`).join(",");
  return `${url}${url.includes("?") ? "&" : "?"}addons=${addons}&addonSrc=web_ai`;
}

const priceText = (n: number) => (Number(n) > 0 ? `NT$${Number(n).toLocaleString()}` : "免費");

export function AddonCardList({ addons, accommodationId, onAdded }: {
  addons: AiAddonCard[];
  accommodationId: string;
  onAdded?: (a: AiAddonCard) => void;
}) {
  const [picks, setPicks] = useState(() => readAddonPicks(accommodationId));
  if (!addons.length) return null;

  const add = (a: AiAddonCard) => {
    const next = { ...readAddonPicks(accommodationId), [a.addon_type]: Math.max(1, a.min ?? 0) };
    writeAddonPicks(accommodationId, next);
    setPicks(next);
    onAdded?.(a);
  };

  return (
    <div className="space-y-2 mt-2" data-testid="ai-addon-card-list">
      {addons.map((a) => {
        const added = (picks[a.addon_type] ?? 0) > 0;
        return (
          <div
            key={a.addon_type}
            data-testid={`ai-addon-card-${a.addon_type}`}
            className="rounded-xl border border-border bg-background shadow-sm p-3 flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground leading-snug">{a.name}</p>
              <p className="text-xs text-primary font-medium">
                {priceText(a.price_per_unit)} / {a.unit_label}
                <span className="text-muted-foreground font-normal">・{a.pricing_mode === "per_night" ? "每晚" : "每次"}</span>
              </p>
            </div>
            <button
              data-testid={`ai-addon-add-${a.addon_type}`}
              disabled={added}
              onClick={() => add(a)}
              className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground"
            >
              {added ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {added ? "已加入" : "加入"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
