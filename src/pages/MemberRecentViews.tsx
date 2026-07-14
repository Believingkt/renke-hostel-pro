import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, History, Trash2, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { zhTW } from "date-fns/locale";
import { isMemberPreview, mockRecentViews } from "@/lib/memberPreviewMock";
import { getRecentViews, removeRecentView, clearRecentViews, type RecentView } from "@/lib/recentViews";

const MemberRecentViews = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<RecentView[]>([]);

  useEffect(() => {
    if (isMemberPreview()) {
      setItems(mockRecentViews as any);
      return;
    }
    // paint immediately from cache, then refresh from cloud
    setItems(getRecentViews());
    (async () => {
      const { fetchRecentViews } = await import("@/lib/recentViews");
      const remote = await fetchRecentViews();
      setItems(remote);
    })();
  }, []);

  const remove = (id: string) => {
    if (!isMemberPreview()) removeRecentView(id);
    setItems((prev) => prev.filter((x) => x.accommodation_id !== id));
  };

  const clearAll = () => {
    if (!isMemberPreview()) clearRecentViews();
    setItems([]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <button
          onClick={() => navigate("/member/profile")}
          className="p-1 -ml-1 text-muted-foreground hover:text-foreground"
          aria-label="返回"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold flex-1">最近瀏覽</h1>
        {items.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground">
            <Trash2 className="h-4 w-4 mr-1" /> 清除
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <Card className="p-10 text-center">
          <History className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <div className="text-sm text-muted-foreground">尚無瀏覽紀錄</div>
          <div className="text-xs text-muted-foreground/70 mt-1">瀏覽住宿頁面後會自動記錄於此</div>
          <Button
            className="mt-4 bg-[hsl(24,100%,50%)] hover:bg-[hsl(24,100%,45%)] text-white"
            onClick={() => navigate("/booking")}
          >
            立即探索住宿
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((v) => (
            <Card key={v.accommodation_id} className="p-0 overflow-hidden">
              <div className="flex">
                <Link
                  to={v.path}
                  className="flex-1 flex gap-3 p-3 hover:bg-orange-50/60 transition"
                >
                  <div className="h-20 w-20 rounded-md overflow-hidden bg-muted shrink-0">
                    {v.image_url ? (
                      <img src={v.image_url} alt={v.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground/40">
                        <History className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="text-sm font-medium truncate">{v.name}</div>
                      {v.region && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3" />
                          {v.region}
                        </div>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(v.viewed_at), { addSuffix: true, locale: zhTW })}
                    </div>
                  </div>
                </Link>
                <button
                  onClick={() => remove(v.accommodation_id)}
                  className="px-3 text-muted-foreground/60 hover:text-red-500 hover:bg-red-50 transition"
                  aria-label="移除"
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

export default MemberRecentViews;
