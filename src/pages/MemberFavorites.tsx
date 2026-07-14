import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, Heart, MapPin, Loader2, Trash2, Search, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { isMemberPreview, mockFavorites } from "@/lib/memberPreviewMock";

interface FavItem {
  id: string;
  accommodation_id: string;
  accommodation_name: string;
  region: string | null;
  region_1: string | null;
  image_url: string | null;
  path: string;
  rating: number | null;
  created_at: string;
}

type SortKey = "recent" | "oldest" | "rating" | "name";

const MemberFavorites = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState<FavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [region, setRegion] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("recent");

  useEffect(() => { load(); }, []);

  const load = async () => {
    if (isMemberPreview()) {
      setItems(mockFavorites as any);
      setLoading(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: member } = await supabase.from("platform_members").select("id").eq("user_id", user.id).maybeSingle();
    if (!member) { setLoading(false); return; }

    const { data: favs } = await (supabase as any)
      .from("member_favorites")
      .select("id, accommodation_id, created_at")
      .eq("member_id", member.id)
      .order("created_at", { ascending: false });

    const rows = favs || [];
    if (rows.length === 0) { setItems([]); setLoading(false); return; }

    const accIds = rows.map((r: any) => r.accommodation_id);
    const [{ data: accs }, { data: photos }] = await Promise.all([
      supabase.from("accommodation_info")
        .select("id, name, region_1, region_2, short_url_alias")
        .in("id", accIds),
      supabase.from("accommodation_photos")
        .select("accommodation_id, image_url, display_order")
        .in("accommodation_id", accIds)
        .order("display_order", { ascending: true }),
    ]);

    // avg rating per accommodation (best-effort)
    let ratingMap = new Map<string, number>();
    try {
      const { data: reviews } = await (supabase as any)
        .from("reviews")
        .select("accommodation_id, rating")
        .in("accommodation_id", accIds);
      const agg = new Map<string, { s: number; n: number }>();
      (reviews || []).forEach((r: any) => {
        if (r.rating == null) return;
        const a = agg.get(r.accommodation_id) || { s: 0, n: 0 };
        a.s += Number(r.rating); a.n += 1;
        agg.set(r.accommodation_id, a);
      });
      agg.forEach((v, k) => ratingMap.set(k, v.s / v.n));
    } catch { /* reviews may not be readable */ }

    const photoMap = new Map<string, string>();
    (photos || []).forEach((p: any) => { if (!photoMap.has(p.accommodation_id)) photoMap.set(p.accommodation_id, p.image_url); });
    const accMap = new Map<string, any>((accs || []).map((a: any) => [a.id, a]));

    setItems(rows.map((r: any) => {
      const acc = accMap.get(r.accommodation_id);
      const region = [acc?.region_1, acc?.region_2].filter(Boolean).join(" ") || null;
      return {
        id: r.id,
        accommodation_id: r.accommodation_id,
        accommodation_name: acc?.name || "已下架",
        region,
        region_1: acc?.region_1 || null,
        image_url: photoMap.get(r.accommodation_id) || null,
        path: acc?.short_url_alias ? `/${acc.short_url_alias}` : `/booking/${r.accommodation_id}`,
        rating: ratingMap.get(r.accommodation_id) ?? null,
        created_at: r.created_at,
      };
    }));
    setLoading(false);
  };

  const remove = async (fav: FavItem) => {
    if (isMemberPreview()) {
      setItems((prev) => prev.filter((x) => x.id !== fav.id));
      toast({ title: "已取消收藏" }); return;
    }
    const { error } = await (supabase as any).from("member_favorites").delete().eq("id", fav.id);
    if (error) { toast({ title: "取消失敗", description: error.message, variant: "destructive" }); return; }
    setItems((prev) => prev.filter((x) => x.id !== fav.id));
    toast({ title: "已取消收藏" });
  };

  const regions = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => { if (i.region_1) s.add(i.region_1); });
    return Array.from(s).sort();
  }, [items]);

  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    let list = items.filter((v) => {
      if (region !== "all" && v.region_1 !== region) return false;
      if (kw && !(v.accommodation_name.toLowerCase().includes(kw) || (v.region || "").toLowerCase().includes(kw))) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "oldest": return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "rating": return (b.rating ?? -1) - (a.rating ?? -1);
        case "name": return a.accommodation_name.localeCompare(b.accommodation_name, "zh-Hant");
        default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return list;
  }, [items, keyword, region, sort]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <button onClick={() => navigate("/member/profile")} className="p-1 -ml-1 text-muted-foreground hover:text-foreground" aria-label="返回">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold flex-1">已收藏</h1>
        {items.length > 0 && (
          <span className="text-xs text-muted-foreground">共 {items.length} 筆</span>
        )}
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜尋住宿名稱或地區"
              className="pl-9 pr-9"
            />
            {keyword && (
              <button
                onClick={() => setKeyword("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                aria-label="清除"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger><SelectValue placeholder="地區" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部地區</SelectItem>
                {regions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">最近收藏</SelectItem>
                <SelectItem value="oldest">最早收藏</SelectItem>
                <SelectItem value="rating">評分高至低</SelectItem>
                <SelectItem value="name">名稱 A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center">
          <Heart className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <div className="text-sm text-muted-foreground">尚未收藏任何住宿</div>
          <div className="text-xs text-muted-foreground/70 mt-1">在住宿頁面點擊愛心即可加入收藏</div>
          <Button className="mt-4 bg-[hsl(24,100%,50%)] hover:bg-[hsl(24,100%,45%)] text-white" onClick={() => navigate("/booking")}>
            探索住宿
          </Button>
        </Card>
      ) : visible.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          沒有符合條件的收藏
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((v) => (
            <Card key={v.id} className="p-0 overflow-hidden">
              <div className="flex">
                <button
                  onClick={() => navigate(v.path)}
                  className="flex-1 flex gap-3 p-3 hover:bg-orange-50/60 transition text-left"
                >
                  <div className="h-20 w-20 rounded-md overflow-hidden bg-muted shrink-0">
                    {v.image_url ? (
                      <img src={v.image_url} alt={v.accommodation_name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground/40">
                        <Heart className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="text-sm font-medium truncate">{v.accommodation_name}</div>
                    {v.region && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" /> {v.region}
                      </div>
                    )}
                    {v.rating != null && (
                      <div className="text-[11px] text-[hsl(24,100%,50%)] mt-0.5">
                        ★ {v.rating.toFixed(1)}
                      </div>
                    )}
                  </div>
                </button>
                <button
                  onClick={() => remove(v)}
                  className="px-3 text-[hsl(24,100%,50%)] hover:bg-red-50 hover:text-red-500 transition"
                  aria-label="取消收藏"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default MemberFavorites;
