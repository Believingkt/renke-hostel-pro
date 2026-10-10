/**
 * /liff/favorites — 收藏清單管理（列表 / 移除 / 前往預約）
 * 綁定會員後（user_id）與會員中心收藏合併顯示。
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Trash2 } from "lucide-react";
import { Button } from "@lakeze/shared/components/ui/button";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { initLiff, butlerApi, getLiffIdToken, type LiffProfile } from "@/lib/liff";
import { toast } from "sonner";
import { bookingPath } from "@lakeze/shared/lib/frontendUrl";

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
  const [loggedIn, setLoggedIn] = useState(false);
  const [bindState, setBindState] = useState<"idle" | "bound" | "error">("idle");
  const [bindError, setBindError] = useState("");

  const load = async (lineUserId: string) => {
    const res = await butlerApi<{ favorites: FavoriteRow[] }>({
      action: "list_favorites",
      line_user_id: lineUserId,
    });
    setRows(res?.favorites ?? []);
  };

  // 綁定：後端以會員 JWT 取 user_id、以 LIFF ID token 驗證 line_user_id
  const bindMember = async (lineUserId: string) => {
    const { data, error } = await supabase.functions.invoke("line-butler-api", {
      body: { action: "link_member", line_user_id: lineUserId, id_token: getLiffIdToken() },
    });
    if (!error && (data as { ok?: boolean })?.ok) {
      setBindState("bound");
      return;
    }
    let msg = "綁定失敗，請稍後再試";
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = await (error as any)?.context?.json?.();
      if (body?.error) msg = String(body.error);
    } catch { /* ignore */ }
    setBindState("error");
    setBindError(msg);
  };

  const goLogin = () => navigate(`/member/auth?redirect=${encodeURIComponent("/liff/favorites")}`);

  useEffect(() => {
    (async () => {
      const p = await initLiff();
      setProfile(p);
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id ?? null;
      setLoggedIn(!!userId);
      if (p.lineUserId) {
        if (userId && !p.isMock) await bindMember(p.lineUserId);
        await load(p.lineUserId);
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

        {!profile?.isMock && !loggedIn && (
          <div className="mb-4 rounded-xl border border-border bg-card p-4" data-testid="liff-bind-cta">
            <p className="text-sm font-semibold text-foreground">登入會員，同步官網「我的行程」</p>
            <p className="mt-1 text-xs text-muted-foreground">登入後 LINE 收藏會綁定到你的會員帳號</p>
            <Button className="mt-3 w-full" onClick={goLogin} data-testid="liff-bind-login-btn">登入會員並綁定</Button>
          </div>
        )}
        {bindState === "bound" && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700" data-testid="liff-bind-ok">
            已綁定會員，收藏會與官網「我的行程」同步 ✅
          </div>
        )}
        {bindState === "error" && (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive" data-testid="liff-bind-error">
            {bindError}
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
