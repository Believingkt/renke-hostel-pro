import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import {
  Star,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Database,
  XCircle,
  Search,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GoogleReviewsSettings } from "./GoogleReviewsSettings";

type SortOption = "newest" | "oldest" | "rating_desc" | "rating_asc";
type TextFilter = "all" | "with_text" | "no_text";
type TimeRange = "all" | "7d" | "30d" | "90d" | "180d" | "365d";

interface CachedReview {
  rating: number;
  text: string;
  authorName: string;
  authorPhoto?: string | null;
  authorUrl?: string | null;
  publishTime?: string | null;
  relativeTime?: string | null;
}

interface CachedReviews {
  placeId: string;
  name?: string;
  rating?: number | null;
  totalReviews?: number;
  googleMapsUri?: string;
  reviews?: CachedReview[];
}

interface Props {
  accommodationId: string | null;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const GoogleReviewsMonitor = ({ accommodationId }: Props) => {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [cache, setCache] = useState<CachedReviews | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<{
    message: string;
    at: string;
  } | null>(null);

  // 篩選 / 排序 state
  const [keyword, setKeyword] = useState("");
  const [ratingFilter, setRatingFilter] = useState<Set<number>>(new Set());
  const [textFilter, setTextFilter] = useState<TextFilter>("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  // 欄位顯示切換(持久化)
  const COLS_KEY = "google-reviews-monitor-cols-v1";
  const [visibleCols, setVisibleCols] = useState<{
    author: boolean;
    photo: boolean;
    rating: boolean;
    publishTime: boolean;
    text: boolean;
  }>(() => {
    if (typeof window === "undefined")
      return { author: true, photo: true, rating: true, publishTime: true, text: true };
    try {
      const raw = localStorage.getItem(COLS_KEY);
      if (raw) return { author: true, photo: true, rating: true, publishTime: true, text: true, ...JSON.parse(raw) };
    } catch {}
    return { author: true, photo: true, rating: true, publishTime: true, text: true };
  });
  const toggleCol = (k: keyof typeof visibleCols) => {
    setVisibleCols((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try {
        localStorage.setItem(COLS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const toggleRating = (n: number) => {
    setRatingFilter((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const resetFilters = () => {
    setKeyword("");
    setRatingFilter(new Set());
    setTextFilter("all");
    setTimeRange("all");
    setSortBy("newest");
  };

  const filteredReviews = useMemo(() => {
    const all = cache?.reviews ?? [];
    const kw = keyword.trim().toLowerCase();
    const now = Date.now();
    const rangeMs: Record<TimeRange, number | null> = {
      all: null,
      "7d": 7 * 86400_000,
      "30d": 30 * 86400_000,
      "90d": 90 * 86400_000,
      "180d": 180 * 86400_000,
      "365d": 365 * 86400_000,
    };
    const limit = rangeMs[timeRange];

    const filtered = all.filter((r) => {
      if (ratingFilter.size > 0 && !ratingFilter.has(Math.round(r.rating))) {
        return false;
      }
      const hasText = !!(r.text && r.text.trim().length > 0);
      if (textFilter === "with_text" && !hasText) return false;
      if (textFilter === "no_text" && hasText) return false;
      if (kw) {
        const hay = `${r.text || ""} ${r.authorName || ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      if (limit && r.publishTime) {
        const t = new Date(r.publishTime).getTime();
        if (Number.isFinite(t) && now - t > limit) return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "newest":
        case "oldest": {
          const ta = a.publishTime ? new Date(a.publishTime).getTime() : 0;
          const tb = b.publishTime ? new Date(b.publishTime).getTime() : 0;
          return sortBy === "newest" ? tb - ta : ta - tb;
        }
        case "rating_desc":
          return b.rating - a.rating;
        case "rating_asc":
          return a.rating - b.rating;
      }
    });
    return sorted;
  }, [cache, keyword, ratingFilter, textFilter, timeRange, sortBy]);

  const totalCount = cache?.reviews?.length ?? 0;
  const hasActiveFilter =
    keyword.trim() !== "" ||
    ratingFilter.size > 0 ||
    textFilter !== "all" ||
    timeRange !== "all" ||
    sortBy !== "newest";

  const load = useCallback(async () => {
    if (!accommodationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("accommodation_info")
      .select(
        "google_place_id, google_reviews_cache, google_reviews_cached_at"
      )
      .eq("id", accommodationId)
      .maybeSingle();
    if (error) {
      toast.error("讀取失敗:" + error.message);
    } else if (data) {
      setPlaceId(data.google_place_id || null);
      setCache((data.google_reviews_cache as unknown as CachedReviews) || null);
      setCachedAt(data.google_reviews_cached_at || null);
    }
    setLoading(false);
  }, [accommodationId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSync = async () => {
    if (!accommodationId) return;
    if (syncing) return; // 防連點:同步進行中直接忽略
    if (!placeId) {
      toast.error("尚未設定 Google Place ID");
      return;
    }
    setSyncing(true);
    setLastError(null);
    const toastId = toast.loading("正在向 Google 取得最新評論...");
    try {
      const { data, error } = await supabase.functions.invoke(
        "fetch-google-reviews",
        { body: { accommodationId, force: true } }
      );
      if (error) throw error;
      if (data?.error) {
        const msg = data.message || data.error;
        setLastError({ message: String(msg), at: new Date().toISOString() });
        toast.error("同步失敗:" + msg, { id: toastId });
      } else {
        setCache(data.data);
        setCachedAt(data.cachedAt);
        toast.success("已同步 Google 評論", { id: toastId });
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      setLastError({ message: msg, at: new Date().toISOString() });
      toast.error("同步失敗:" + msg, { id: toastId });
    } finally {
      setSyncing(false);
    }
  };

  if (!accommodationId) return null;
  if (loading) return null;

  const ageMs = cachedAt ? Date.now() - new Date(cachedAt).getTime() : null;
  const isFresh = ageMs !== null && ageMs < CACHE_TTL_MS;
  const status: "not_configured" | "fresh" | "stale" | "never" = !placeId
    ? "not_configured"
    : !cachedAt
    ? "never"
    : isFresh
    ? "fresh"
    : "stale";

  const statusBadge = {
    not_configured: (
      <Badge variant="secondary" className="gap-1">
        <XCircle className="h-3 w-3" /> 未設定
      </Badge>
    ),
    never: (
      <Badge variant="outline" className="gap-1 border-amber-500 text-amber-700">
        <AlertTriangle className="h-3 w-3" /> 尚未同步
      </Badge>
    ),
    stale: (
      <Badge variant="outline" className="gap-1 border-amber-500 text-amber-700">
        <Clock className="h-3 w-3" /> 快取已過期
      </Badge>
    ),
    fresh: (
      <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> 快取新鮮
      </Badge>
    ),
  }[status];

  const formatAge = (ms: number) => {
    const min = Math.floor(ms / 60000);
    if (min < 60) return `${min} 分鐘前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} 小時前`;
    const day = Math.floor(hr / 24);
    return `${day} 天前`;
  };

  return (
    <div className="space-y-6">
      {/* 狀態總覽 */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-1.5 bg-primary rounded-full" />
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  Google 評論同步狀態 {statusBadge}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  即時查看 Place ID、快取內容與最近一次更新結果
                </p>
              </div>
            </div>
            <Button
              type="button"
              onClick={handleSync}
              disabled={syncing || !placeId}
              aria-busy={syncing}
              aria-live="polite"
              className="gap-2 min-w-[130px]"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "同步中,請稍候..." : "立即同步"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatBox
              label="Place ID"
              value={placeId || "—"}
              mono
            />
            <StatBox
              label="星等"
              value={
                cache?.rating != null
                  ? `${cache.rating.toFixed(1)} ★`
                  : "—"
              }
            />
            <StatBox
              label="總評論數"
              value={cache?.totalReviews?.toLocaleString() ?? "—"}
            />
            <StatBox
              label="快取評論數"
              value={`${cache?.reviews?.length ?? 0} 則`}
            />
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between flex-wrap gap-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              最後同步:
              {cachedAt ? (
                <span className="text-foreground font-medium">
                  {new Date(cachedAt).toLocaleString("zh-TW")}
                  {ageMs !== null && (
                    <span className="text-muted-foreground ml-1">
                      ({formatAge(ageMs)})
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-foreground font-medium">尚未同步</span>
              )}
            </div>
            {cache?.googleMapsUri && (
              <a
                href={cache.googleMapsUri}
                target="_blank"
                rel="noreferrer"
                className="text-primary inline-flex items-center gap-1 hover:underline"
              >
                在 Google 地圖開啟 <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {lastError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-1">
              <div className="flex items-center gap-2 text-destructive font-medium">
                <AlertTriangle className="h-4 w-4" />
                最近一次同步錯誤
              </div>
              <p className="text-destructive/90 break-all whitespace-pre-wrap">
                {lastError.message}
              </p>
              <p className="text-xs text-muted-foreground">
                發生時間:{new Date(lastError.at).toLocaleString("zh-TW")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 快取評論內容 */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-1.5 bg-primary rounded-full" />
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Database className="h-5 w-5" />
                目前快取的評論內容
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                這些就是前台「旅客評價」區會顯示的資料
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 篩選列 */}
          {totalCount > 0 && (
            <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="搜尋評論內容或評論者..."
                    className="pl-9 h-10"
                  />
                </div>
                <Select
                  value={timeRange}
                  onValueChange={(v) => setTimeRange(v as TimeRange)}
                >
                  <SelectTrigger className="w-[140px] h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部時間</SelectItem>
                    <SelectItem value="7d">最近 7 天</SelectItem>
                    <SelectItem value="30d">最近 30 天</SelectItem>
                    <SelectItem value="90d">最近 3 個月</SelectItem>
                    <SelectItem value="180d">最近 6 個月</SelectItem>
                    <SelectItem value="365d">最近 1 年</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={textFilter}
                  onValueChange={(v) => setTextFilter(v as TextFilter)}
                >
                  <SelectTrigger className="w-[140px] h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">文字:全部</SelectItem>
                    <SelectItem value="with_text">僅有文字</SelectItem>
                    <SelectItem value="no_text">僅純星等</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={sortBy}
                  onValueChange={(v) => setSortBy(v as SortOption)}
                >
                  <SelectTrigger className="w-[140px] h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">最新優先</SelectItem>
                    <SelectItem value="oldest">最舊優先</SelectItem>
                    <SelectItem value="rating_desc">星等高→低</SelectItem>
                    <SelectItem value="rating_asc">星等低→高</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground mr-1">
                  星等:
                </span>
                {[5, 4, 3, 2, 1].map((n) => (
                  <Toggle
                    key={n}
                    pressed={ratingFilter.has(n)}
                    onPressedChange={() => toggleRating(n)}
                    size="sm"
                    className="h-8 px-2 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                    aria-label={`${n} 星`}
                  >
                    <span className="flex items-center gap-0.5 text-sm">
                      {n}
                      <Star className="h-3 w-3 fill-current" />
                    </span>
                  </Toggle>
                ))}
                <div className="flex-1" />
                <span className="text-xs text-muted-foreground">
                  顯示 {filteredReviews.length} / {totalCount} 則
                </span>
                {hasActiveFilter && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resetFilters}
                    className="h-8 gap-1 text-xs"
                  >
                    <X className="h-3 w-3" /> 清除篩選
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* 欄位顯示切換 */}
          {totalCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-1">
              <span className="text-xs text-muted-foreground mr-1">
                顯示欄位:
              </span>
              {([
                ["author", "作者"],
                ["photo", "頭像"],
                ["rating", "評分"],
                ["publishTime", "發布時間"],
                ["text", "文字內容"],
              ] as const).map(([key, label]) => (
                <Toggle
                  key={key}
                  pressed={visibleCols[key]}
                  onPressedChange={() => toggleCol(key)}
                  size="sm"
                  className="h-7 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  {label}
                </Toggle>
              ))}
            </div>
          )}

          {!cache?.reviews?.length ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              {placeId
                ? "目前沒有快取資料,請按上方「立即同步」"
                : "尚未設定 Google Place ID"}
            </div>
          ) : filteredReviews.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              沒有符合條件的評論,請調整篩選條件
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReviews.map((rv, i) => {
                const showHeader =
                  visibleCols.author || visibleCols.photo || visibleCols.rating || visibleCols.publishTime;
                return (
                  <div
                    key={i}
                    className="rounded-lg border p-4 space-y-2 bg-background"
                  >
                    {showHeader && (
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          {visibleCols.photo && rv.authorPhoto && (
                            <img
                              src={rv.authorPhoto}
                              alt={rv.authorName}
                              className="h-8 w-8 rounded-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <div>
                            {visibleCols.author && (
                              <div className="font-medium text-sm">
                                {rv.authorName}
                              </div>
                            )}
                            {(visibleCols.rating || visibleCols.publishTime) && (
                              <div className="flex items-center gap-1">
                                {visibleCols.rating &&
                                  [1, 2, 3, 4, 5].map((s) => (
                                    <Star
                                      key={s}
                                      className={`h-3.5 w-3.5 ${
                                        s <= Math.round(rv.rating)
                                          ? "fill-primary text-primary"
                                          : "text-muted-foreground/30"
                                      }`}
                                    />
                                  ))}
                                {visibleCols.publishTime && rv.relativeTime && (
                                  <span className="text-xs text-muted-foreground ml-2">
                                    {rv.relativeTime}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        {visibleCols.author && rv.authorUrl && (
                          <a
                            href={rv.authorUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                          >
                            Google 個人檔案 <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    )}
                    {visibleCols.text && (
                      <p className="text-sm whitespace-pre-wrap text-foreground/90">
                        {rv.text || <em className="text-muted-foreground">(無文字內容)</em>}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 設定區塊(複用既有元件) */}
      <GoogleReviewsSettings accommodationId={accommodationId} />
    </div>
  );
};

const StatBox = ({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) => (
  <div className="rounded-lg border bg-muted/30 p-3">
    <div className="text-xs text-muted-foreground mb-1">{label}</div>
    <div
      className={`text-sm font-semibold break-all ${
        mono ? "font-mono text-xs" : ""
      }`}
    >
      {value}
    </div>
  </div>
);
