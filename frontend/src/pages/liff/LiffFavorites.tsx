/**
 * /liff/favorites — 收藏清單管理（列表 / 移除 / 前往預約）
 * 綁定會員後（user_id）與會員中心收藏合併顯示。
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { initLiff, butlerApi, type LiffProfile } from "@/lib/liff";
import { toast } from "sonner";
import { bookingPath } from "@/lib/frontendUrl";

interface FavoriteRow {
  id: string;
  ref_type: string;
  ref_id: string;
  meta: { name?: string; accommodation_id?: string | null; price?: number } | null;
  created_at: string;
}

export default function LiffFavorites() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<LiffProfile | null>(null);
  const [rows, setRows] = useState<FavoriteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (lineUserId: string, userId: string | null) => {
    const res = await butlerApi<{ favorites: FavoriteRow[] }>({
      action: "list_favorites",
      line_user_id: lineUserId,
      user_id: userId,
    });
    setRows(res?.favorites ?? []);
  };

  useEffect(() => {
    (async () => {
      const p = await initLiff();
      setProfile(p);
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id ?? null;
      if (p.lineUserId) {
        if (userId) await butlerApi({ action: "link_member", line_user_id: p.lineUserId, user_id: userId });
        await load(p.lineUserId, userId);
      }
      setLoading(false);
    })();
  }, []);

  const remove = async (id: string) => {
    if (!profile?.lineUserId) return;
    await butlerApi({ action: "remove_favorite", line_user_id: profile.lineUserId, id });
    setRows((prev) => prev.filter((r) => r.id !== id));
    toast.success("已移除收藏");
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <h1 className="text-base font-bold text-foreground">❤️ 我的收藏</h1>
      </header>

      <div className="mx-auto max-w-xl px-4 py-4">
        {profile?.isMock && (
          <div className="mb-4 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            目前不是在 LINE App 內開啟（測試模式）。請從 LINE 對話中的按鈕開啟以載入你的收藏。
          </div>
        )}

        {rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <Heart className="mx-auto mb-2 h-6 w-6 opacity-40" />
            還沒有收藏，去跟小安聊聊看看喜歡的房型吧 😊
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{r.meta?.name ?? r.ref_type}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.ref_type === "room" ? "房型" : r.ref_type === "product" ? "加購" : "行程"}
                  </p>
                </div>
                {r.ref_type === "room" && r.meta?.accommodation_id && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => navigate(bookingPath(r.meta!.accommodation_id))}
                  >
                    前往預約
                  </Button>
                )}
                <button onClick={() => remove(r.id)} aria-label="移除收藏">
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
