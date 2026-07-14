import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, Heart, MapPin, Loader2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { isMemberPreview, mockFavorites } from "@/lib/memberPreviewMock";

interface FavItem {
  id: string;
  accommodation_id: string;
  accommodation_name: string;
  region: string | null;
  image_url: string | null;
  path: string;
  created_at: string;
}

const MemberFavorites = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState<FavItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

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
    const { data: accs } = await supabase
      .from("accommodation_info")
      .select("id, name, region_1, region_2, short_url_alias")
      .in("id", accIds);

    // Cover photos
    const { data: photos } = await supabase
      .from("accommodation_photos")
      .select("accommodation_id, image_url, display_order")
      .in("accommodation_id", accIds)
      .order("display_order", { ascending: true });

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
        image_url: photoMap.get(r.accommodation_id) || null,
        path: acc?.short_url_alias ? `/${acc.short_url_alias}` : `/booking/${r.accommodation_id}`,
        created_at: r.created_at,
      };
    }));
    setLoading(false);
  };

  const remove = async (fav: FavItem) => {
    if (isMemberPreview()) {
      setItems((prev) => prev.filter((x) => x.id !== fav.id));
      toast({ title: "已取消收藏" });
      return;
    }
    const { error } = await (supabase as any).from("member_favorites").delete().eq("id", fav.id);
    if (error) {
      toast({ title: "取消失敗", description: error.message, variant: "destructive" });
      return;
    }
    setItems((prev) => prev.filter((x) => x.id !== fav.id));
    toast({ title: "已取消收藏" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <button onClick={() => navigate("/member/profile")} className="p-1 -ml-1 text-muted-foreground hover:text-foreground" aria-label="返回">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold flex-1">已收藏</h1>
      </div>

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
      ) : (
        <div className="space-y-2">
          {items.map((v) => (
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
