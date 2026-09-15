import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Session 續期容錯：
 * - 手機瀏覽器背景久放後回前景時，主動 getSession() 觸發 supabase-js 檢查 / 續期 token。
 * - 網路錯誤只重試，不做任何登出動作；只有 refresh token 真的失效（supabase-js 會自行
 *   發出 SIGNED_OUT 事件）才會由既有守衛把人導回登入頁。
 */
export function useSessionKeepAlive(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const revalidate = async (attempt = 0) => {
      if (cancelled) return;
      try {
        await supabase.auth.getSession();
      } catch {
        // 純網路錯誤：保留畫面，稍後自動重試（最多 3 次，指數退避）
        if (attempt < 3) {
          retryTimer = setTimeout(() => void revalidate(attempt + 1), 2000 * (attempt + 1));
        }
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void revalidate();
    };
    const onOnline = () => void revalidate();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onVisibility);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onVisibility);
    };
  }, [enabled]);
}
