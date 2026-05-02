import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Star,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Database,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GoogleReviewsSettings } from "./GoogleReviewsSettings";

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
    if (!placeId) {
      toast.error("尚未設定 Google Place ID");
      return;
    }
    setSyncing(true);
    setLastError(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "fetch-google-reviews",
        { body: { accommodationId, force: true } }
      );
      if (error) throw error;
      if (data?.error) {
        const msg = data.message || data.error;
        setLastError({ message: String(msg), at: new Date().toISOString() });
        toast.error("同步失敗:" + msg);
      } else {
        setCache(data.data);
        setCachedAt(data.cachedAt);
        toast.success("已同步 Google 評論");
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      setLastError({ message: msg, at: new Date().toISOString() });
      toast.error("同步失敗:" + msg);
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
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "同步中..." : "立即同步"}
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
        <CardContent>
          {!cache?.reviews?.length ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              {placeId
                ? "目前沒有快取資料,請按上方「立即同步」"
                : "尚未設定 Google Place ID"}
            </div>
          ) : (
            <div className="space-y-3">
              {cache.reviews.map((rv, i) => (
                <div
                  key={i}
                  className="rounded-lg border p-4 space-y-2 bg-background"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      {rv.authorPhoto && (
                        <img
                          src={rv.authorPhoto}
                          alt={rv.authorName}
                          className="h-8 w-8 rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <div>
                        <div className="font-medium text-sm">
                          {rv.authorName}
                        </div>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`h-3.5 w-3.5 ${
                                s <= Math.round(rv.rating)
                                  ? "fill-primary text-primary"
                                  : "text-muted-foreground/30"
                              }`}
                            />
                          ))}
                          {rv.relativeTime && (
                            <span className="text-xs text-muted-foreground ml-2">
                              {rv.relativeTime}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {rv.authorUrl && (
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
                  <p className="text-sm whitespace-pre-wrap text-foreground/90">
                    {rv.text || <em className="text-muted-foreground">(無文字內容)</em>}
                  </p>
                </div>
              ))}
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
