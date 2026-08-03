/**
 * /trips/templates — 5 情境模板選擇（行動優先）
 * 帶入 C2 traveler_attributes 最新一筆屬性，選擇情境後導向 /trips/generate
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Baby, Bike, Heart, Home, Users, ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LangSwitch } from "@/components/trips/LangSwitch";
import { normalizeLang, tripText, type TripLang } from "@/lib/tripI18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const TRIP_SCENARIOS = [
  {
    key: "family",
    icon: Baby,
    label: { zh: "家庭親子", ja: "ファミリー", en: "Family" },
    desc: {
      zh: "步調輕鬆、親子友善的湖畔一日",
      ja: "ゆったり親子向けの湖畔プラン",
      en: "Easy-paced, kid-friendly lakeside day",
    },
  },
  {
    key: "couple",
    icon: Heart,
    label: { zh: "情侶約會", ja: "カップル", en: "Couple" },
    desc: {
      zh: "夕陽、湯屋與慢食的兩人時光",
      ja: "夕日と温泉、二人の時間",
      en: "Sunset, hot spring and slow dining",
    },
  },
  {
    key: "friends",
    icon: Users,
    label: { zh: "好友出遊", ja: "友達旅行", en: "Friends" },
    desc: {
      zh: "打卡熱點與夜間活動一次滿足",
      ja: "映えスポットとナイトアクティビティ",
      en: "Photo spots and night activities",
    },
  },
  {
    key: "villa",
    icon: Home,
    label: { zh: "包棟聚會", ja: "貸切ステイ", en: "Villa" },
    desc: {
      zh: "以整棟住宿為核心的團體行程",
      ja: "一棟貸しを中心にした団体プラン",
      en: "Group trip centred on a whole villa",
    },
  },
  {
    key: "outdoor",
    icon: Bike,
    label: { zh: "戶外探索", ja: "アウトドア", en: "Outdoor" },
    desc: {
      zh: "步道、單車與生態導覽",
      ja: "トレイル・サイクリング・自然ガイド",
      en: "Trails, cycling and nature guides",
    },
  },
] as const;

export type ScenarioKey = (typeof TRIP_SCENARIOS)[number]["key"];

const PAGE_TEXT = {
  zh: {
    title: "選擇你的旅遊情境",
    subtitle: "小安會依你的旅遊屬性，智能生成專屬行程",
    attrTitle: "已帶入的旅遊屬性",
    noAttr: "還沒有旅遊屬性，先跟小安聊聊會更準確",
    goGuide: "去對話導引",
    generate: "生成推薦行程",
  },
  ja: {
    title: "旅のシーンを選ぶ",
    subtitle: "アンさんが属性に合わせて旅程を自動生成します",
    attrTitle: "反映される旅行属性",
    noAttr: "属性がまだありません。まずアンさんと話すとより正確です",
    goGuide: "対話ガイドへ",
    generate: "旅程を生成",
  },
  en: {
    title: "Choose your travel scenario",
    subtitle: "An will generate an itinerary from your traveller profile",
    attrTitle: "Traveller attributes in use",
    noAttr: "No attributes yet — chat with An for better results",
    goGuide: "Go to guide",
    generate: "Generate itinerary",
  },
} as const;

export interface TravelerAttrs {
  trip_duration?: string | null;
  festival?: string | null;
  party_size?: number | null;
  companion_type?: string | null;
  purpose?: string | null;
  budget?: number | null;
  highlights?: string[] | null;
}

export function getStoredAttributes(): TravelerAttrs | null {
  try {
    const raw = localStorage.getItem("traveler_attributes");
    return raw ? (JSON.parse(raw) as TravelerAttrs) : null;
  } catch {
    return null;
  }
}

export default function TripTemplates() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const lang = normalizeLang(params.get("lang")) as TripLang;
  const t = tripText(lang);
  const p = PAGE_TEXT[lang];
  const [attrs, setAttrs] = useState<TravelerAttrs | null>(null);
  const [selected, setSelected] = useState<ScenarioKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = getStoredAttributes();
      if (local) setAttrs(local);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;
      const { data } = await supabase
        .from("traveler_attributes")
        .select("trip_duration, festival, party_size, companion_type, purpose, budget, highlights")
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) setAttrs(data as TravelerAttrs);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLang = (next: TripLang) => {
    const q = new URLSearchParams(params);
    q.set("lang", next);
    setParams(q, { replace: true });
  };

  const chips = useMemo(() => {
    if (!attrs) return [];
    const list: string[] = [];
    if (attrs.trip_duration) list.push(attrs.trip_duration);
    if (attrs.festival) list.push(attrs.festival);
    if (attrs.party_size) list.push(`${attrs.party_size} 人`);
    if (attrs.purpose) list.push(attrs.purpose);
    if (attrs.budget) list.push(`NT$ ${attrs.budget.toLocaleString()}／人`);
    (attrs.highlights || []).forEach((h) => list.push(h));
    return list;
  }, [attrs]);

  const go = (key: ScenarioKey) => {
    setSelected(key);
    const q = new URLSearchParams();
    q.set("scenario", key);
    q.set("lang", lang);
    navigate(`/trips/generate?${q.toString()}`);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">{p.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{p.subtitle}</p>
        </div>
        <LangSwitch value={lang} onChange={setLang} />
      </div>

      <section className="mb-5 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          {p.attrTitle}
        </div>
        {chips.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <Badge key={c} variant="secondary" className="font-normal">
                {c}
              </Badge>
            ))}
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{p.noAttr}</span>
            <Link to={`/trips/guide?lang=${lang}`} className="font-medium text-primary underline-offset-4 hover:underline">
              {p.goGuide}
            </Link>
          </div>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {TRIP_SCENARIOS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => go(s.key)}
            className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-secondary/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
              <s.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
                {s.label[lang]}
                <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{s.desc[lang]}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5">
        <Button
          className="w-full"
          disabled={!selected}
          onClick={() => selected && go(selected)}
        >
          {p.generate}
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">{t.tripsSubtitle}</p>
      </div>
    </div>
  );
}
