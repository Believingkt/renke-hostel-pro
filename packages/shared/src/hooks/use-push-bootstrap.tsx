import { useEffect } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { isNativeApp } from "@lakeze/shared/lib/appMode";
import { bootstrapPushForExistingSession, initPushNotifications } from "@lakeze/shared/lib/pushNotifications";
import { clearAppBadge, logBadgeDiagnostics, syncBadgeFromServer } from "@lakeze/shared/lib/appBadge";
import { initMessagesUnread, subscribeMessagesUnread } from "@lakeze/shared/lib/messagesUnread";

/**
 * App 啟動時檢查通知權限：
 * - 只要有既有會員 session（不限剛登入）就初始化 → 未詢問過會跳出系統權限詢問
 * - 已允許則每次啟動 register()，重新 upsert device token（token 可能輪替）
 * - 啟動、回前景、進背景時同步 App icon 角標未讀數；登出歸零
 * - 網頁版完全不執行
 */
export function usePushBootstrap() {
  useEffect(() => {
    if (!isNativeApp()) return;

    // 啟動就把分類未讀載入全域 store（不依賴訊息頁）
    initMessagesUnread();
    void logBadgeDiagnostics().then(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      await syncBadgeFromServer(session?.user ? "startup" : "startup-anon");
    });
    void bootstrapPushForExistingSession();

    const onVisible = () => {
      if (document.visibilityState === "visible") void syncBadgeFromServer("visibilitychange");
    };
    document.addEventListener("visibilitychange", onVisible);

    let removeResume: (() => void) | undefined;
    let removeState: (() => void) | undefined;
    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("resume", () => {
          void syncBadgeFromServer("resume");
        });
        removeResume = () => void handle.remove();
        // 進入背景／inactive 時再寫一次，確保桌面 icon 顯示最新未讀數
        const stateHandle = await App.addListener("appStateChange", ({ isActive }) => {
          console.log("[badge] appStateChange isActive =", isActive);
          void syncBadgeFromServer(isActive ? "foreground" : "background");
        });
        removeState = () => void stateHandle.remove();
      } catch {
        /* 無 App plugin 時僅靠 visibilitychange */
      }
    })();


    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        void initPushNotifications();
        void syncBadgeFromServer("signed-in");
      }
      if (event === "SIGNED_OUT") {
        void clearAppBadge();
      }
    });
    // 訊息未讀變動時同步
    const unsubscribeUnread = subscribeMessagesUnread(() => {
      void syncBadgeFromServer("unread-changed");
    });

    return () => {
      unsubscribeUnread();
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      removeResume?.();
      removeState?.();

    };
  }, []);
}
