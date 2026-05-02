import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  GripVertical,
  Save,
  Eye,
  RotateCcw,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GoogleReviewsSettings } from "./GoogleReviewsSettings";
import { GoogleReviewsPreview } from "./GoogleReviewsPreview";

const reviewKey = (rv: { authorName: string; publishTime?: string | null }) =>
  `${rv.authorName}__${rv.publishTime || ""}`;

type SortOption =
  | "newest"
  | "oldest"
  | "rating_desc"
  | "rating_asc"
  | "custom";
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

  // 前台顯示控制
  const [displayCount, setDisplayCount] = useState<number>(5);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]); // 同時是排序順序
  const [savedDisplayCount, setSavedDisplayCount] = useState<number>(5);
  const [savedSelectedKeys, setSavedSelectedKeys] = useState<string[]>([]);
  const [savingDisplay, setSavingDisplay] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);

  // 重置後是否自動套用至前台
  const AUTO_APPLY_RESET_KEY = "google-reviews-auto-apply-reset-v1";
  const [autoApplyReset, setAutoApplyReset] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(AUTO_APPLY_RESET_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleAutoApplyReset = (next: boolean) => {
    setAutoApplyReset(next);
    try {
      localStorage.setItem(AUTO_APPLY_RESET_KEY, next ? "1" : "0");
    } catch {}
  };

  // 拖曳排序後是否自動套用至前台
  const AUTO_APPLY_DRAG_KEY = "google-reviews-auto-apply-drag-v1";
  const [autoApplyDrag, setAutoApplyDrag] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(AUTO_APPLY_DRAG_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleAutoApplyDrag = (next: boolean) => {
    setAutoApplyDrag(next);
    try {
      localStorage.setItem(AUTO_APPLY_DRAG_KEY, next ? "1" : "0");
    } catch {}
  };

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
        case "custom": {
          const orderMap = new Map(selectedKeys.map((k, idx) => [k, idx]));
          const ai = orderMap.has(reviewKey(a)) ? orderMap.get(reviewKey(a))! : Infinity;
          const bi = orderMap.has(reviewKey(b)) ? orderMap.get(reviewKey(b))! : Infinity;
          if (ai !== bi) return ai - bi;
          // 未選的依最新排序
          const ta = a.publishTime ? new Date(a.publishTime).getTime() : 0;
          const tb = b.publishTime ? new Date(b.publishTime).getTime() : 0;
          return tb - ta;
        }
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
  }, [cache, keyword, ratingFilter, textFilter, timeRange, sortBy, selectedKeys]);

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
        "google_place_id, google_reviews_cache, google_reviews_cached_at, google_reviews_display_count, google_reviews_selected_keys"
      )
      .eq("id", accommodationId)
      .maybeSingle();
    if (error) {
      toast.error("讀取失敗:" + error.message);
    } else if (data) {
      setPlaceId(data.google_place_id || null);
      setCache((data.google_reviews_cache as unknown as CachedReviews) || null);
      setCachedAt(data.google_reviews_cached_at || null);
      const dc = (data as any).google_reviews_display_count ?? 5;
      const sk = Array.isArray((data as any).google_reviews_selected_keys)
        ? ((data as any).google_reviews_selected_keys as string[])
        : [];
      setDisplayCount(dc);
      setSavedDisplayCount(dc);
      setSelectedKeys(sk);
      setSavedSelectedKeys(sk);
    }
    setLoading(false);
  }, [accommodationId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selectAllVisible = () => {
    const visibleKeys = filteredReviews.map(reviewKey);
    setSelectedKeys((prev) => {
      const next = [...prev];
      for (const k of visibleKeys) if (!next.includes(k)) next.push(k);
      return next;
    });
  };

  const clearSelection = () => setSelectedKeys([]);

  // 將已勾選評論依「最新發佈時間」重新排序(預設順序),並即時套用到前台預覽
  const resetCustomOrder = async () => {
    const all = cache?.reviews ?? [];
    if (selectedKeys.length === 0) {
      toast.info("目前沒有自訂順序可重置");
      return;
    }
    const previousKeys = [...selectedKeys];
    const map = new Map(all.map((r) => [reviewKey(r), r]));
    const resorted = [...selectedKeys]
      .filter((k) => map.has(k))
      .sort((a, b) => {
        const ra = map.get(a)!;
        const rb = map.get(b)!;
        const ta = ra.publishTime ? new Date(ra.publishTime).getTime() : 0;
        const tb = rb.publishTime ? new Date(rb.publishTime).getTime() : 0;
        return tb - ta;
      });
    setSelectedKeys(resorted);

    if (!autoApplyReset) {
      toast.success("已重置為預設排序(最新優先)");
      return;
    }

    // 自動套用流程:先顯示 loading,等寫入成功才回報成功
    setShowPreview(true);
    setPreviewRefreshKey((k) => k + 1);
    const toastId = toast.loading("正在重置並套用至前台...");
    const result = await saveDisplaySettings({
      keysOverride: resorted,
      silent: true,
    });
    if (result.ok) {
      toast.success("已重置並套用至前台", { id: toastId });
      return;
    }
    const errMsg = "error" in result ? result.error : "未知錯誤";
    toast.error(`套用失敗:${errMsg}`, {
      id: toastId,
      description: "前台尚未更新,可恢復為套用前的預覽排序",
      duration: 12000,
      action: {
        label: "恢復到套用前預覽",
        onClick: () => restorePreviewOrder(previousKeys),
      },
    });
  };

  // 恢復預覽到指定的「套用前」排序快照
  const restorePreviewOrder = (snapshot: string[]) => {
    setSelectedKeys([...snapshot]);
    setPreviewRefreshKey((k) => k + 1);
    setShowPreview(true);
    toast.success("已恢復到套用前的預覽排序");
  };

  // 拖曳自動套用:debounce 600ms,避免連續拖曳轟炸 DB
  const dragAutoApplyTimerRef = useRef<number | null>(null);
  const dragAutoApplyToastIdRef = useRef<string | number | null>(null);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    let nextKeys: string[] | null = null;
    setSelectedKeys((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return prev;
      const moved = arrayMove(prev, oldIndex, newIndex);
      nextKeys = moved;
      return moved;
    });

    if (!autoApplyDrag || !nextKeys) return;

    // 立刻刷新預覽,DB 寫入則 debounce
    setShowPreview(true);
    setPreviewRefreshKey((k) => k + 1);

    if (dragAutoApplyTimerRef.current) {
      window.clearTimeout(dragAutoApplyTimerRef.current);
    }
    if (!dragAutoApplyToastIdRef.current) {
      dragAutoApplyToastIdRef.current = toast.loading("排序變更中...");
    }
    const keysToSave = nextKeys;
    dragAutoApplyTimerRef.current = window.setTimeout(async () => {
      const result = await saveDisplaySettings({
        keysOverride: keysToSave,
        silent: true,
      });
      const tid = dragAutoApplyToastIdRef.current ?? undefined;
      dragAutoApplyToastIdRef.current = null;
      if (result.ok) {
        toast.success("排序已自動套用至前台", { id: tid });
      } else {
        const errMsg = "error" in result ? result.error : "未知錯誤";
        toast.error(`套用失敗:${errMsg}`, {
          id: tid,
          description: "前台尚未更新,請重試或手動點擊「套用至前台」",
          duration: 8000,
        });
      }
    }, 600);
  };

  useEffect(() => {
    return () => {
      if (dragAutoApplyTimerRef.current) {
        window.clearTimeout(dragAutoApplyTimerRef.current);
      }
    };
  }, []);


  const saveDisplaySettings = async (
    opts?: { keysOverride?: string[]; countOverride?: number; silent?: boolean }
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!accommodationId) return { ok: false, error: "尚未選擇民宿" };
    const count = Math.max(
      1,
      Math.min(50, Math.round(opts?.countOverride ?? displayCount ?? 1))
    );
    const keys = opts?.keysOverride ?? selectedKeys;
    setSavingDisplay(true);
    const { error } = await supabase
      .from("accommodation_info")
      .update({
        google_reviews_display_count: count,
        google_reviews_selected_keys: keys,
      } as any)
      .eq("id", accommodationId);
    setSavingDisplay(false);
    if (error) {
      if (!opts?.silent) toast.error("儲存失敗:" + error.message);
      return { ok: false, error: error.message };
    }
    setSavedDisplayCount(count);
    setSavedSelectedKeys([...keys]);
    setDisplayCount(count);
    if (!opts?.silent) toast.success("已套用至前台");
    return { ok: true };
  };

  const dirty =
    displayCount !== savedDisplayCount ||
    JSON.stringify(selectedKeys) !== JSON.stringify(savedSelectedKeys);

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
                勾選你想顯示在前台的評論,設定數量後按「套用至前台」
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 前台顯示控制 */}
          {totalCount > 0 && (
            <div className="rounded-lg border bg-primary/5 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Eye className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">前台顯示設定</div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedKeys.length === 0
                      ? "未精選任何評論時,前台會自動依「最新優先」顯示前 N 則"
                      : `已精選 ${selectedKeys.length} 則(可拖曳調整順序),前台依此順序顯示`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">顯示</span>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={displayCount}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (Number.isFinite(n)) setDisplayCount(n);
                      else setDisplayCount(1);
                    }}
                    onBlur={() => {
                      const n = Math.max(1, Math.min(50, Math.round(displayCount || 1)));
                      setDisplayCount(n);
                    }}
                    className="h-9 w-20 text-center"
                  />
                  <span className="text-xs text-muted-foreground">則 (1~50)</span>
                </div>
                <div className="flex-1" />
                <Button
                  type="button"
                  variant={showPreview ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowPreview((v) => !v)}
                  className="gap-1"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {showPreview ? "隱藏前台預覽" : "前台預覽"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={selectAllVisible}
                  disabled={filteredReviews.length === 0}
                >
                  全選目前可見
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  disabled={selectedKeys.length === 0}
                >
                  清除精選
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetCustomOrder}
                  disabled={selectedKeys.length === 0}
                  className="gap-1"
                  title="將已勾選評論依最新發佈時間重新排序"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  重置自訂順序
                </Button>
                <label
                  className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none px-1"
                  title="勾選後,點擊「重置自訂順序」會自動儲存並重新載入前台預覽"
                >
                  <Checkbox
                    checked={autoApplyReset}
                    onCheckedChange={(v) => toggleAutoApplyReset(v === true)}
                  />
                  重置後自動套用至前台
                </label>
                <label
                  className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none px-1"
                  title="勾選後,拖曳調整順序會自動儲存(0.6 秒後)並重新載入前台預覽"
                >
                  <Checkbox
                    checked={autoApplyDrag}
                    onCheckedChange={(v) => toggleAutoApplyDrag(v === true)}
                  />
                  拖曳後自動套用至前台
                </label>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => saveDisplaySettings()}
                  disabled={savingDisplay || !dirty}
                  className="gap-1"
                >
                  <Save className="h-3.5 w-3.5" />
                  {savingDisplay ? "儲存中..." : "套用至前台"}
                </Button>
              </div>
              {dirty && (
                <p className="text-xs text-amber-600">
                  有未儲存的變更
                </p>
              )}
            </div>
          )}

          {/* 前台預覽 */}
          {showPreview && totalCount > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Eye className="h-3.5 w-3.5 text-primary" />
                <span>
                  以下為套用「目前(含未儲存)的勾選與顯示數量」後的前台呈現預覽
                </span>
                {dirty && (
                  <span className="text-amber-600 font-medium">
                    · 未儲存
                  </span>
                )}
              </div>
              <GoogleReviewsPreview
                key={`preview-${previewRefreshKey}`}
                reviews={cache?.reviews || []}
                displayCount={Math.max(
                  1,
                  Math.min(50, Math.round(displayCount || 1))
                )}
                selectedKeys={selectedKeys}
                totalReviews={cache?.totalReviews}
                averageRating={cache?.rating ?? null}
                googleMapsUri={cache?.googleMapsUri}
              />
            </div>
          )}

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
                    <SelectItem value="custom">自訂順序(可拖曳)</SelectItem>
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
          ) : sortBy === "custom" ? (
            (() => {
              // 自訂順序模式:依 selectedKeys 順序顯示已勾選評論,拖曳即時改變順序
              const map = new Map(
                (cache?.reviews || []).map((r) => [reviewKey(r), r])
              );
              const orderedSelected = selectedKeys
                .map((k) => map.get(k))
                .filter(Boolean) as CachedReview[];
              if (orderedSelected.length === 0) {
                return (
                  <div className="text-center py-10 text-muted-foreground text-sm space-y-2">
                    <p>自訂順序模式下,僅顯示已勾選的評論。</p>
                    <p className="text-xs">
                      請先切換回其他排序方式勾選評論,再回到此模式拖曳排序。
                    </p>
                  </div>
                );
              }
              return (
                <div className="space-y-3">
                  <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-muted-foreground">
                    🟰 拖曳左側握把調整順序,前台預覽會即時同步(無需先儲存)。
                    顯示 {orderedSelected.length} 則已精選評論。
                  </div>
                  <ReviewList
                    reviews={orderedSelected}
                    visibleCols={visibleCols}
                    selectedKeys={selectedKeys}
                    onToggleSelect={toggleSelect}
                    draggable={true}
                    onDragEnd={handleDragEnd}
                  />
                </div>
              );
            })()
          ) : filteredReviews.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              沒有符合條件的評論,請調整篩選條件
            </div>
          ) : (
            <ReviewList
              reviews={filteredReviews}
              visibleCols={visibleCols}
              selectedKeys={selectedKeys}
              onToggleSelect={toggleSelect}
              draggable={false}
              onDragEnd={handleDragEnd}
            />
          )}
        </CardContent>
      </Card>

      {/* 設定區塊(複用既有元件) */}
      <GoogleReviewsSettings accommodationId={accommodationId} />
    </div>
  );
};

// 評論列表元件:支援拖曳/勾選
interface ReviewListProps {
  reviews: CachedReview[];
  visibleCols: {
    author: boolean;
    photo: boolean;
    rating: boolean;
    publishTime: boolean;
    text: boolean;
  };
  selectedKeys: string[];
  onToggleSelect: (key: string) => void;
  draggable: boolean;
  onDragEnd: (event: DragEndEvent) => void;
}

const ReviewList = ({
  reviews,
  visibleCols,
  selectedKeys,
  onToggleSelect,
  draggable,
  onDragEnd,
}: ReviewListProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const ids = reviews.map(reviewKey);

  if (!draggable) {
    return (
      <div className="space-y-3">
        {reviews.map((rv) => (
          <ReviewCard
            key={reviewKey(rv)}
            rv={rv}
            visibleCols={visibleCols}
            checked={selectedKeys.includes(reviewKey(rv))}
            onToggle={() => onToggleSelect(reviewKey(rv))}
          />
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {reviews.map((rv) => (
            <SortableReviewCard
              key={reviewKey(rv)}
              id={reviewKey(rv)}
              rv={rv}
              visibleCols={visibleCols}
              checked={selectedKeys.includes(reviewKey(rv))}
              onToggle={() => onToggleSelect(reviewKey(rv))}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

interface ReviewCardProps {
  rv: CachedReview;
  visibleCols: ReviewListProps["visibleCols"];
  checked: boolean;
  onToggle: () => void;
  dragHandle?: React.ReactNode;
}

const ReviewCard = ({ rv, visibleCols, checked, onToggle, dragHandle }: ReviewCardProps) => {
  const showHeader =
    visibleCols.author || visibleCols.photo || visibleCols.rating || visibleCols.publishTime;
  return (
    <div
      className={`rounded-lg border p-4 space-y-2 bg-background transition-colors ${
        checked ? "border-primary/50 bg-primary/5" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {dragHandle}
        <div
          className="pt-0.5 cursor-pointer"
          onClick={onToggle}
          role="checkbox"
          aria-checked={checked}
        >
          <Checkbox checked={checked} onCheckedChange={onToggle} />
        </div>
        <div className="flex-1 space-y-2 min-w-0">
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
                    <div className="font-medium text-sm">{rv.authorName}</div>
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
      </div>
    </div>
  );
};

const SortableReviewCard = ({
  id,
  ...rest
}: ReviewCardProps & { id: string }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <ReviewCard
        {...rest}
        dragHandle={
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 -ml-1"
            aria-label="拖曳排序"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        }
      />
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
