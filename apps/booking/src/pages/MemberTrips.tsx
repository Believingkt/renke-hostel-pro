import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { ChevronLeft, Map as MapIcon, Loader2, Trash2, Heart, Package, BedDouble } from "lucide-react";
import { Card } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { useToast } from "@lakeze/shared/hooks/use-toast";

interface TripFav {
  id: string;
  ref_type: "trip" | "room" | "product";
  ref_id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta: any;
  created_at: string;
}

const TYPE_LABEL: Record<string, string> = { trip: "行程", room: "房型", product: "加購" };

const MemberTrips = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState<TripFav[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("trip_favorites")
      .select("id, ref_type, ref_id, meta, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setItems((data || []) as TripFav[]);
    setLoading(false);
  };

  const remove = async (fav: TripFav) => {
    const { error } = await supabase.from("trip_favorites").delete().eq("id", fav.id);
    if (error) { toast({ title: "取消失敗", description: error.message, variant: "destructive" }); return; }
    setItems((prev) => prev.filter((x) => x.id !== fav.id));
    toast({ title: "已取消收藏" });
  };

  const open = (fav: TripFav) => {
    if (fav.ref_type === "trip") {
      const url = fav.meta?.trip_url || `/trips/generate?trip=${fav.ref_id}`;
      navigate(url);
    }
  };

  const trips = items.filter((i) => i.ref_type === "trip");
  const others = items.filter((i) => i.ref_type !== "trip");

  const iconFor = (t: string) => (t === "room" ? BedDouble : t === "product" ? Package : MapIcon);

  return (
    <div className="space-y-4" data-testid="member-trips-page">
      <div className="flex items-center gap-2 px-1">
        <button onClick={() => navigate("/member/profile")} className="p-1 -ml-1 text-muted-foreground hover:text-foreground" aria-label="返回">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold flex-1">我的行程</h1>
        {items.length > 0 && <span className="text-xs text-muted-foreground">共 {items.length} 筆</span>}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center">
          <Heart className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <div className="text-sm text-muted-foreground">尚未收藏任何行程</div>
          <div className="text-xs text-muted-foreground/70 mt-1">在 AI 行程或 LINE 管家按下愛心即可收藏</div>
          <Button className="mt-4 bg-[hsl(24,100%,50%)] hover:bg-[hsl(24,100%,45%)] text-white" onClick={() => navigate("/trips/generate")}>
            規劃行程
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {trips.length > 0 && (
            <div className="space-y-2">
              {trips.map((f) => {
                const Icon = iconFor(f.ref_type);
                return (
                  <Card key={f.id} className="p-0 overflow-hidden" data-testid="member-trip-card">
                    <div className="flex">
                      <button onClick={() => open(f)} className="flex-1 flex gap-3 p-3 hover:bg-orange-50/60 transition text-left">
                        <div className="h-16 w-16 rounded-md bg-orange-50 shrink-0 flex items-center justify-center text-[hsl(24,100%,50%)]">
                          <Icon className="h-6 w-6" />
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <div className="text-sm font-medium truncate">{f.meta?.title || "我的行程"}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {TYPE_LABEL[f.ref_type]}
                            {f.meta?.total_price ? `・預估 NT$ ${Number(f.meta.total_price).toLocaleString()}` : ""}
                          </div>
                        </div>
                      </button>
                      <button onClick={() => remove(f)} className="px-3 text-[hsl(24,100%,50%)] hover:bg-red-50 hover:text-red-500 transition" aria-label="取消收藏">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {others.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground px-1">房型／加購收藏</div>
              {others.map((f) => {
                const Icon = iconFor(f.ref_type);
                return (
                  <Card key={f.id} className="p-3 flex items-center gap-3" data-testid="member-trip-other">
                    <div className="h-10 w-10 rounded-md bg-muted shrink-0 flex items-center justify-center text-muted-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{f.meta?.name || TYPE_LABEL[f.ref_type]}</div>
                      <div className="text-xs text-muted-foreground">{TYPE_LABEL[f.ref_type]}</div>
                    </div>
                    <button onClick={() => remove(f)} className="px-2 text-[hsl(24,100%,50%)] hover:text-red-500 transition" aria-label="取消收藏">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MemberTrips;
