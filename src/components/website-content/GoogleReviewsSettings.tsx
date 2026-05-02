import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Star, RefreshCw, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  accommodationId: string;
}

interface CachedReviews {
  placeId: string;
  name?: string;
  rating?: number | null;
  totalReviews?: number;
  googleMapsUri?: string;
  reviews?: Array<{
    rating: number;
    text: string;
    authorName: string;
    authorPhoto?: string | null;
    authorUrl?: string | null;
    publishTime?: string | null;
    relativeTime?: string | null;
  }>;
}

export const GoogleReviewsSettings = ({ accommodationId }: Props) => {
  const [placeId, setPlaceId] = useState("");
  const [originalPlaceId, setOriginalPlaceId] = useState("");
  const [cache, setCache] = useState<CachedReviews | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!accommodationId) return;
    setLoading(true);
    const { data } = await supabase
      .from("accommodation_info")
      .select("google_place_id, google_reviews_cache, google_reviews_cached_at")
      .eq("id", accommodationId)
      .maybeSingle();
    if (data) {
      const pid = data.google_place_id || "";
      setPlaceId(pid);
      setOriginalPlaceId(pid);
      setCache((data.google_reviews_cache as unknown as CachedReviews) || null);
      setCachedAt(data.google_reviews_cached_at || null);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accommodationId]);

  const handleSave = async () => {
    setSaving(true);
    const trimmed = placeId.trim();
    const { error } = await supabase
      .from("accommodation_info")
      .update({ google_place_id: trimmed || null })
      .eq("id", accommodationId);
    if (error) {
      toast.error("儲存失敗:" + error.message);
    } else {
      toast.success("已儲存 Google Place ID");
      setOriginalPlaceId(trimmed);
    }
    setSaving(false);
  };

  const handleSync = async (force = true) => {
    if (!placeId.trim()) {
      toast.error("請先填入 Place ID");
      return;
    }
    if (placeId.trim() !== originalPlaceId) {
      // 自動先存
      await handleSave();
    }
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "fetch-google-reviews",
        { body: { accommodationId, force } }
      );
      if (error) throw error;
      if (data?.error) {
        toast.error("同步失敗:" + (data.message || data.error));
      } else {
        toast.success("已同步 Google 評論");
        setCache(data.data);
        setCachedAt(data.cachedAt);
      }
    } catch (e: any) {
      toast.error("同步失敗:" + (e?.message || String(e)));
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-1.5 bg-primary rounded-full" />
          <div>
            <CardTitle className="text-xl">Google 評論串接</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              填入 Google 地點 ID,系統自動抓取最新 5 則評論顯示於前台「旅客評價」區
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="google-place-id" className="text-base font-medium">
            Google Place ID
          </Label>
          <Input
            id="google-place-id"
            value={placeId}
            onChange={(e) => setPlaceId(e.target.value)}
            placeholder="例:ChIJN1t_tDeuEmsRUsoyG83frY4"
            className="h-11 text-base font-mono"
          />
          <p className="text-xs text-muted-foreground">
            <a
              href="https://developers.google.com/maps/documentation/places/web-service/place-id?hl=zh-tw"
              target="_blank"
              rel="noreferrer"
              className="underline inline-flex items-center gap-1"
            >
              如何找到 Place ID
              <ExternalLink className="h-3 w-3" />
            </a>
            {" "}· 留空會關閉 Google 評論,改顯示原本手動評論
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || placeId.trim() === originalPlaceId}
          >
            {saving ? "儲存中..." : "儲存 Place ID"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSync(true)}
            disabled={syncing || !placeId.trim()}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "同步中..." : "立即同步評論"}
          </Button>
        </div>

        {cache && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-primary">
                  {cache.rating?.toFixed(1) ?? "—"}
                </span>
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`h-5 w-5 ${
                        s <= Math.round(cache.rating || 0)
                          ? "fill-primary text-primary"
                          : "text-muted-foreground/30"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">
                  共 {cache.totalReviews ?? 0} 則 Google 評論 · 顯示前 {cache.reviews?.length ?? 0} 則
                </span>
              </div>
              {cache.googleMapsUri && (
                <a
                  href={cache.googleMapsUri}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
                >
                  在 Google 地圖開啟 <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            {cachedAt && (
              <p className="text-xs text-muted-foreground">
                最後同步:{new Date(cachedAt).toLocaleString("zh-TW")}
                (每 24 小時自動更新,或按上方「立即同步」)
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
