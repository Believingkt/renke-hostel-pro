/**
 * /trips/generate — 智能生成結果（依情境模板 + 旅客屬性）
 * 排序：① 建議時段 ② 營業時間窗 ③ 同時段最短路徑（由 trip-recommend 計算）
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, MapPin, RefreshCw, Clock, AlertTriangle, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LangSwitch } from "@/components/trips/LangSwitch";
import { MatchBadge } from "@/components/trips/MatchBadge";
import { TimelineItem, type TimelineItemType } from "@/components/trips/TimelineItem";
import { normalizeLang, pickLang, tripText, type TripLang } from "@/lib/tripI18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { TRIP_SCENARIOS, getStoredAttributes, type ScenarioKey } from "./TripTemplates";

interface GenItem {
  ref_type: string;
  ref_id: string;
  qty: number;
  day: number;
  order: number;
  slot: string;
  start_time: string;
  end_time: string;
  type: string;
  name: unknown;
  price: number;
  duration_min: number | null;
  open_hours: string | null;
  within_open_hours: boolean;
  distance_km: number;
  guide: { zh: string; ja: string; en: string };
}

interface GenTrip {
  scenario: string;
  title: { zh: string; ja: string; en: string };
  guide: { zh: string; ja: string; en: string };
  match_score: number;
  items: GenItem[];
  total_price: number;
  total_distance_km: number;
  snapshot_id?: string | null;
  translation_status?: "pending" | "ready" | "failed";
}

const PAGE_TEXT = {
  zh: {
    title: "智能推薦行程",
    generating: "小安正在為你排行程…",
    regenerate: "重新生成",
    save: "儲存為我的行程",
    saved: "已儲存",
    loginFirst: "請先登入才能儲存行程",
    distance: (km: number) => `總移動距離約 ${km} 公里`,
    slot: { morning: "上午", afternoon: "下午", evening: "傍晚／夜間" } as Record<string, string>,
    outOfHours: "超出營業時間，建議調整",
    empty: "目前沒有可推薦的行程，請稍後再試",
    failed: "生成失敗，請再試一次",
    translating: "翻譯準備中，完成後會自動更新（先顯示中文）",
    translateFailed: "翻譯失敗",
    retry: "重試",
  },
  ja: {
    title: "おすすめ旅程",
    generating: "アンさんが旅程を作成中…",
    regenerate: "再生成",
    save: "マイ旅程に保存",
    saved: "保存しました",
    loginFirst: "保存にはログインが必要です",
    distance: (km: number) => `総移動距離 約 ${km} km`,
    slot: { morning: "午前", afternoon: "午後", evening: "夕方・夜" } as Record<string, string>,
    outOfHours: "営業時間外の可能性があります",
    empty: "現在おすすめできる旅程がありません",
    failed: "生成に失敗しました",
    translating: "翻訳を準備中です（完了後に自動で切り替わります）",
    translateFailed: "翻訳に失敗しました",
    retry: "再試行",
  },
  en: {
    title: "Recommended itinerary",
    generating: "An is planning your trip…",
    regenerate: "Regenerate",
    save: "Save as my trip",
    saved: "Saved",
    loginFirst: "Please sign in to save this trip",
    distance: (km: number) => `About ${km} km of travel in total`,
    slot: { morning: "Morning", afternoon: "Afternoon", evening: "Evening" } as Record<string, string>,
    outOfHours: "Outside opening hours",
    empty: "No itinerary available right now",
    failed: "Generation failed, please try again",
    translating: "Preparing translation — it will update automatically",
    translateFailed: "Translation failed",
    retry: "Retry",
  },
} as const;

const TYPE_MAP: Record<string, TimelineItemType> = {
  attraction: "attraction",
  ticket: "ticket",
  experience: "experience",
  meal: "meal",
  room: "room",
};

export default function TripGenerate() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const lang = normalizeLang(params.get("lang")) as TripLang;
  const scenario = (params.get("scenario") || "family") as ScenarioKey;
  const tripId = params.get("trip");
  const t = tripText(lang);
  const p = PAGE_TEXT[lang];

  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<GenTrip[]>([]);
  const [more, setMore] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedIds, setSavedIds] = useState<Record<number, string>>({});
  const startedRef = useRef(false);

  const scenarioMeta = TRIP_SCENARIOS.find((s) => s.key === scenario);

  const generate = useCallback(async () => {
    setLoading(true);
    setTrips([]);
    setSavedIds({});
    const attributes = getStoredAttributes() || {};
    const exclude: string[] = [];
    const results: GenTrip[] = [];
    try {
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        const { data, error } = await supabase.functions.invoke("trip-recommend", {
          // fast：先出中文（低延遲模型）；persist：落地快照，日／英由背景補寫
          body: { scenario, attributes, exclude, fast: true, persist: true, source: "web" },
        });
        if (error) throw error;
        const trip = data as GenTrip;
        if (!trip?.items?.length) continue;
        console.info("[trip-generate] trip", i + 1, `${Math.round(performance.now() - t0)}ms`, trip.snapshot_id);
        trip.items.forEach((it) => {
          if (it.ref_type === "product") exclude.push(it.ref_id);
        });
        results.push(trip);
        setTrips([...results].sort((a, b) => b.match_score - a.match_score));
        // 有第一條行程就先解除 loading，其餘在背景補齊
        setLoading(false);
      }
      if (!results.length) toast({ title: p.empty, variant: "destructive" });
    } catch (e) {
      console.error("trip-recommend failed", e);
      toast({ title: p.failed, variant: "destructive" });
    } finally {
      setLoading(false);
      setMore(false);
    }
  }, [scenario, p.empty, p.failed]);

  // 優先讀取 LINE 端已生成的行程快照（秒開、內容與卡片一致）
  const loadSnapshot = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("trip_generations")
        .select("payload, translation_status")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      const trip = data?.payload as unknown as GenTrip | undefined;
      if (trip?.items?.length) {
        console.info("[trip-snapshot] hit", id, { items: trip.items.length, total: trip.total_price });
        setTrips([
          {
            ...trip,
            snapshot_id: id,
            translation_status: (data?.translation_status as GenTrip["translation_status"]) || "ready",
          },
        ]);
        setLoading(false);
        return true;
      }
      console.warn("[trip-snapshot] miss", id, "— no row or empty payload (regenerating)");
      return false;
    } catch (e) {
      console.error("[trip-snapshot] error", id, e);
      return false;

    }
  }, []);


  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      if (tripId && (await loadSnapshot(tripId))) return;
      await generate();
    })();
  }, [generate, loadSnapshot, tripId]);

  const setLang = (next: TripLang) => {
    const q = new URLSearchParams(params);
    q.set("lang", next);
    setParams(q, { replace: true });
  };

  const saveTrip = async (trip: GenTrip, index: number) => {
    setSavingId(index);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        toast({ title: p.loginFirst, variant: "destructive" });
        navigate("/auth");
        return;
      }
      const { data, error } = await supabase
        .from("trips")
        .insert({
          owner_id: auth.user.id,
          title: trip.title,
          scenario: trip.scenario,
          match_score: trip.match_score,
          total_price: trip.total_price,
          items: trip.items as unknown as never,
          status: "draft",
        })
        .select("id")
        .single();
      if (error) throw error;
      setSavedIds((prev) => ({ ...prev, [index]: data.id }));
      toast({ title: p.saved });
    } catch (e) {
      console.error("save trip failed", e);
      toast({ title: p.failed, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">{p.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {scenarioMeta ? scenarioMeta.label[lang] : scenario} · {t.tripsSubtitle}
          </p>
        </div>
        <LangSwitch value={lang} onChange={setLang} />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (tripId) {
              const q = new URLSearchParams(params);
              q.delete("trip");
              setParams(q, { replace: true });
            }
            setMore(true);
            void generate();
          }}
          disabled={loading || more}
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading || more ? "animate-spin" : ""}`} />
          {p.regenerate}
        </Button>
        <Link
          to={`/trips/templates?lang=${lang}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {t.back}
        </Link>
      </div>

      {loading && !trips.length && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {p.generating}
        </div>
      )}

      <div className="space-y-5">
        {trips.map((trip, index) => {
          const spots = trip.items.filter((i) => i.ref_type !== "room");
          const totalMin = trip.items.reduce((s, i) => s + (i.duration_min || 0), 0);
          return (
            <article key={index} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-foreground">{pickLang(trip.title, lang)}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {pickLang(trip.guide, lang)}
                  </p>
                </div>
                <MatchBadge score={trip.match_score} label={t.match} />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{t.spots(spots.length)}</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {p.distance(trip.total_distance_km)}
                </span>
                {totalMin > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {t.totalDuration((totalMin / 60).toFixed(1))}
                  </span>
                )}
              </div>

              <div className="mt-3">
                {trip.items.map((item, i) => (
                  <TimelineItem
                    key={`${item.ref_id}-${i}`}
                    type={TYPE_MAP[item.type] ?? "attraction"}
                    time={item.start_time ? `${item.start_time}${item.end_time ? `–${item.end_time}` : ""}` : null}
                    title={pickLang(item.name, lang) || t.stayLabel}
                    subtitle={pickLang(item.guide, lang)}
                    durationMin={item.duration_min}
                    price={item.price}
                    isLast={i === trip.items.length - 1}
                    trailing={
                      <Badge variant="secondary" className="font-normal">
                        {p.slot[item.slot] || item.slot}
                      </Badge>
                    }
                  >
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      {item.open_hours && <span>{item.open_hours}</span>}
                      {item.distance_km > 0 && <span>+{item.distance_km} km</span>}
                      {!item.within_open_hours && (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <AlertTriangle className="h-3 w-3" />
                          {p.outOfHours}
                        </span>
                      )}
                    </div>
                  </TimelineItem>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
                <div className="text-sm">
                  <span className="text-muted-foreground">{t.total}</span>
                  <span className="ml-2 font-semibold tabular-nums text-foreground">
                    NT$ {trip.total_price.toLocaleString()}
                  </span>
                </div>
                {savedIds[index] ? (
                  <Button size="sm" variant="outline" onClick={() => navigate(`/trips/${savedIds[index]}?lang=${lang}`)}>
                    {p.saved} · {t.cta}
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => void saveTrip(trip, index)} disabled={savingId === index}>
                    {savingId === index ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {p.save}
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {(loading || more) && trips.length > 0 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {p.generating}
        </div>
      )}
    </div>
  );
}
