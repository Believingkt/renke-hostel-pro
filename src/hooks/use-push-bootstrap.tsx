import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "@/lib/appMode";
import { bootstrapPushForExistingSession, initPushNotifications } from "@/lib/pushNotifications";
import { clearAppBadge, syncBadgeFromServer } from "@/lib/appBadge";

/**
 * App 啟動時檢查通知權限：
 * - 只要有既有會員 session（不限剛登入）就初始化 → 未詢問過會跳出系統權限詢問
 * - 已允許則每次啟動 register()，重新 upsert device token（token 可能輪替）
 * - 啟動、回前景時同步 App icon 角標未讀數；登出歸零
 * - 網頁版完全不執行
 */
export function usePushBootstrap() {
  useEffect(() => {
    if (!isNativeApp()) return;

    void bootstrapPushForExistingSession();
    void syncBadgeFromServer();

    const onVisible = () => {
      if (document.visibilityState === "visible") void syncBadgeFromServer();
    };
    document.addEventListener("visibilitychange", onVisible);

    let removeResume: (() => void) | undefined;
    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("resume", () => {
          void syncBadgeFromServer();
        });
        removeResume = () => void handle.remove();
      } catch {
        /* 無 App plugin 時僅靠 visibilitychange */
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        void initPushNotifications();
        void syncBadgeFromServer();
      }
      if (event === "SIGNED_OUT") {
        void clearAppBadge();
      }
    });
    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      removeResume?.();
    };
  }, []);
}
