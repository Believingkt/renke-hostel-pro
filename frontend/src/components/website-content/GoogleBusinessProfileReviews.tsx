import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStaffPermissions } from "@/hooks/use-staff-permissions";
import {
  buildApplyPayload,
  canApplySelection,
  filterCandidates,
  sortCandidates,
  type CandidateSort,
  type GbpCandidate,
} from "@/lib/gbpApply";

/**
 * Business Profile 候選評論池。同步只更新此列表；只有按下「套用至前台」
 * 才會改寫 accommodation_info.google_reviews_cache / google_reviews_selected_keys。
 * 前台顯示數量（google_reviews_display_count）不在此變更。
 */

const PAGE_SIZE = 10;

interface Props {
  accommodationId: string;
  refreshKey?: number;
  onApplied?: () => void;
}

export const GoogleBusinessProfileReviews = ({
  accommodationId,
  refreshKey = 0,
  onApplied,
}: Props) => {
  const { canEdit } = useStaffPermissions();
  const readOnly = !canEdit("website_content");

  const [rows, setRows] = useState<GbpCandidate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const [rating, setRating] = useState<string>("all");
  const [sort, setSort] = useState<CandidateSort>("newest");
  const [page, setPage] = useState(0);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    if (!accommodationId) return;
    const { data, error } = await supabase
      .from("accommodation_google_business_reviews")
      .select(
        "review_name, reviewer_name, reviewer_photo_url, star_rating, comment, create_time, update_time",
      )
      .eq("accommodation_id", accommodationId)
      .order("create_time", { ascending: false })
      .limit(500);
    if (error) {
      toast.error("讀取候選評論失敗：" + error.message);
      return;
    }
    setRows((data as GbpCandidate[]) ?? []);
    setLoaded(true);
  }, [accommodationId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const filtered = useMemo(
    () =>
      sortCandidates(
        filterCandidates(rows, {
          keyword,
          rating: rating === "all" ? null : Number(rating),
        }),
        sort,
      ),
    [rows, keyword, rating, sort],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [keyword, rating, sort]);

  const toggle = (name: string) =>
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );

  const applyState = canApplySelection(selected.length, rows.length);

  const handleApply = async () => {
    if (!applyState.allowed) return;
    setApplying(true);
    const payload = buildApplyPayload(rows, selected);
    const { data, error } = await supabase
      .from("accommodation_info")
      .update({
        google_reviews_cache: JSON.parse(
          JSON.stringify({ source: "BUSINESS_PROFILE", reviews: payload.reviews }),
        ),
        google_reviews_cached_at: new Date().toISOString(),
        google_reviews_selected_keys: payload.selectedKeys,
      })
      .eq("id", accommodationId)
      .select("id");
    setApplying(false);
    if (error) {
      toast.error("套用失敗：" + error.message);
      return;
    }
    if (!data || data.length === 0) {
      toast.error("套用失敗：沒有任何資料被寫入（權限不足）");
      return;
    }
    toast.success(`已套用 ${payload.reviews.length} 則評論至前台`);
    onApplied?.();
  };

  if (!loaded || rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-1.5 rounded-full bg-primary" />
          <div>
            <CardTitle className="text-xl">Business Profile 候選評論</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              已同步 {rows.length} 則評論 · 已選擇 {selected.length} 則（前台至少需 4 則）
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1 space-y-2">
            <Label htmlFor="gbp-search">搜尋</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="gbp-search"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜尋評論內容或評論者"
                className="h-11 pl-9 text-base"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>星等</Label>
            <Select value={rating} onValueChange={setRating}>
              <SelectTrigger className="h-11 w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                {[5, 4, 3, 2, 1].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} 星
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>排序</Label>
            <Select value={sort} onValueChange={(v) => setSort(v as CandidateSort)}>
              <SelectTrigger className="h-11 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">最新</SelectItem>
                <SelectItem value="rating_desc">高星優先</SelectItem>
                <SelectItem value="rating_then_newest">高星＋最新</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          {current.map((c) => (
            <div
              key={c.review_name}
              className="flex items-start gap-3 rounded-lg border p-3 text-sm"
            >
              <Checkbox
                checked={selected.includes(c.review_name)}
                disabled={readOnly}
                onCheckedChange={() => toggle(c.review_name)}
                className="mt-1"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.reviewer_name || "Google 使用者"}</span>
                  <span className="inline-flex items-center gap-0.5 text-amber-600">
                    {Array.from({ length: c.star_rating ?? 0 }).map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-current" />
                    ))}
                  </span>
                  {c.create_time && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.create_time).toLocaleDateString("zh-TW")}
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words text-muted-foreground">
                  {c.comment || "（無文字內容）"}
                </p>
              </div>
            </div>
          ))}
          {current.length === 0 && (
            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
              沒有符合條件的評論
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              上一頁
            </Button>
            <span className="tabular-nums text-muted-foreground">
              {page + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              下一頁
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!applyState.allowed && (
              <Badge variant="outline" className="text-muted-foreground">
                {applyState.reason}
              </Badge>
            )}
            <Button
              onClick={handleApply}
              disabled={readOnly || applying || !applyState.allowed}
            >
              {applying ? "套用中…" : "套用至前台"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
