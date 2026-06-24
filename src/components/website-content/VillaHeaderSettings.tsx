import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { LayoutPanelTop, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import {
  VILLA_FEATURE_ICON_OPTIONS,
  getVillaFeatureIcon,
  type VillaFeatureTag,
} from "@/lib/villa-feature-icons";

interface Props {
  accommodationId: string | null;
}

interface State {
  rating: string;
  ratingLabel: string;
  reviewCount: string;
  topReview: string;
  hostResponseText: string;
}

const empty: State = {
  rating: "",
  ratingLabel: "",
  reviewCount: "",
  topReview: "",
  hostResponseText: "",
};

const VillaHeaderSettings = ({ accommodationId }: Props) => {
  const [form, setForm] = useState<State>(empty);
  const [tags, setTags] = useState<VillaFeatureTag[]>([]);
  const [autoData, setAutoData] = useState<{
    rating: number | null;
    total: number | null;
    topReview: string | null;
  }>({ rating: null, total: null, topReview: null });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accommodationId) return;
    supabase
      .from("accommodation_info")
      .select(
        "villa_header_rating_override, villa_header_rating_label_override, villa_header_review_count_override, villa_header_top_review_override, villa_header_host_response_text, villa_header_feature_tags, google_reviews_cache"
      )
      .eq("id", accommodationId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const d = data as any;
        setForm({
          rating: d.villa_header_rating_override != null ? String(d.villa_header_rating_override) : "",
          ratingLabel: d.villa_header_rating_label_override ?? "",
          reviewCount:
            d.villa_header_review_count_override != null
              ? String(d.villa_header_review_count_override)
              : "",
          topReview: d.villa_header_top_review_override ?? "",
          hostResponseText: d.villa_header_host_response_text ?? "",
        });
        const rawTags = d.villa_header_feature_tags;
        if (Array.isArray(rawTags)) {
          setTags(
            rawTags
              .filter((t: any) => t && typeof t === "object" && t.icon && t.label)
              .slice(0, 6)
              .map((t: any) => ({ icon: String(t.icon), label: String(t.label) }))
          );
        } else {
          setTags([]);
        }
        const cache = d.google_reviews_cache as any;
        let topReview: string | null = null;
        if (cache?.reviews && Array.isArray(cache.reviews) && cache.reviews.length > 0) {
          const candidates = cache.reviews.filter((r: any) => r?.text && r.text.length > 5);
          if (candidates.length > 0) {
            const sorted = [...candidates].sort(
              (a: any, b: any) => (b.rating || 0) - (a.rating || 0)
            );
            topReview = String(sorted[0].text).slice(0, 70);
          }
        }
        setAutoData({
          rating: typeof cache?.rating === "number" ? cache.rating : null,
          total: typeof cache?.totalReviews === "number" ? cache.totalReviews : null,
          topReview,
        });
      });
  }, [accommodationId]);

  const addTag = () => {
    if (tags.length >= 6) return;
    const first = VILLA_FEATURE_ICON_OPTIONS[0];
    setTags((arr) => [...arr, { icon: first.value, label: first.defaultLabel }]);
  };
  const updateTag = (idx: number, patch: Partial<VillaFeatureTag>) => {
    setTags((arr) => arr.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };
  const removeTag = (idx: number) => setTags((arr) => arr.filter((_, i) => i !== idx));
  const moveTag = (idx: number, dir: -1 | 1) => {
    setTags((arr) => {
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return arr;
      const copy = [...arr];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });
  };

  const handleSave = async () => {
    if (!accommodationId) return;

    let ratingNum: number | null = null;
    if (form.rating.trim() !== "") {
      const n = Number(form.rating);
      if (Number.isNaN(n) || n < 0 || n > 10) {
        toast.error("評分需介於 0 ~ 10");
        return;
      }
      ratingNum = Math.round(n * 10) / 10;
    }

    let countNum: number | null = null;
    if (form.reviewCount.trim() !== "") {
      const n = Number(form.reviewCount);
      if (!Number.isInteger(n) || n < 0) {
        toast.error("評論數需為 0 以上的整數");
        return;
      }
      countNum = n;
    }

    const tagsPayload = tags
      .map((t) => ({ icon: t.icon, label: (t.label || "").trim() }))
      .filter((t) => t.label !== "")
      .slice(0, 6);

    setSaving(true);
    const { error } = await supabase
      .from("accommodation_info")
      .update({
        villa_header_rating_override: ratingNum,
        villa_header_rating_label_override: form.ratingLabel.trim() || null,
        villa_header_review_count_override: countNum,
        villa_header_top_review_override: form.topReview.trim() || null,
        villa_header_host_response_text: form.hostResponseText.trim() || null,
        villa_header_feature_tags: tagsPayload.length > 0 ? tagsPayload : null,
      } as any)
      .eq("id", accommodationId);
    setSaving(false);
    if (error) {
      toast.error("儲存失敗：" + error.message);
    } else {
      toast.success("已更新訂房頁標頭");
    }
  };


  if (!accommodationId) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        請先選擇民宿
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <LayoutPanelTop className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">訂房頁標頭</h2>
          <p className="text-sm text-muted-foreground">
            自訂訂房詳情頁標題下方的評分、評論引言與聯繫房東文案。留空則使用 Google 評論自動帶入。
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">評分與評論</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">評分（0 ~ 10）</Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                max={10}
                placeholder={autoData.rating != null ? `自動：${autoData.rating}` : "例：4.9"}
                value={form.rating}
                onChange={(e) => setForm((s) => ({ ...s, rating: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">
                填寫即覆寫 Google 自動評分；&le;5 顯示為 X/5，&gt;5 顯示為 X/10
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">評分標籤</Label>
              <Input
                placeholder="例：超棒 / 極佳 / 推薦"
                maxLength={10}
                value={form.ratingLabel}
                onChange={(e) => setForm((s) => ({ ...s, ratingLabel: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">
                顯示在評分右側的文字（預設「超棒」）
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">評論數</Label>
              <Input
                type="number"
                min={0}
                placeholder={autoData.total != null ? `自動：${autoData.total}` : "例：253"}
                value={form.reviewCount}
                onChange={(e) => setForm((s) => ({ ...s, reviewCount: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">
                填寫即覆寫 Google 自動評論數
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">評論引言</Label>
            <Textarea
              placeholder={
                autoData.topReview
                  ? `自動：${autoData.topReview}`
                  : "例：非常 chill 的地方～很適合一群朋友或是家人來住宿..."
              }
              rows={3}
              maxLength={120}
              value={form.topReview}
              onChange={(e) => setForm((s) => ({ ...s, topReview: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">
              顯示在評分下方的引言；留空則自動取用 Google 最高分評論前 70 字
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">聯繫房東</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label className="text-sm">回覆時間說明</Label>
            <Input
              placeholder="預設：房東通常在 60 分鐘內回覆"
              maxLength={40}
              value={form.hostResponseText}
              onChange={(e) => setForm((s) => ({ ...s, hostResponseText: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">
              顯示在「聯繫住宿」下方的小字
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "儲存中..." : "儲存"}
        </Button>
      </div>
    </div>
  );
};

export default VillaHeaderSettings;
