import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "@/lib/appMode";
import { bootstrapPushForExistingSession, initPushNotifications } from "@/lib/pushNotifications";

/**
 * App 啟動時檢查通知權限：
 * - 只要有既有會員 session（不限剛登入）就初始化 → 未詢問過會跳出系統權限詢問
 * - 已允許則每次啟動 register()，重新 upsert device token（token 可能輪替）
 * - 網頁版完全不執行
 */
export function usePushBootstrap() {
  useEffect(() => {
    if (!isNativeApp()) return;

    void bootstrapPushForExistingSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        void initPushNotifications();
      }
    });
    return () => subscription.unsubscribe();
  }, []);
}
