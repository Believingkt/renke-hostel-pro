import { supabase } from "@lakeze/shared/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

/**
 * 取得目前登入者，離線時以本機持久化的 session 為準。
 *
 * - 先讀本機 session（不需網路）；有 session 就直接回傳其 user。
 * - 沒有本機 session 才呼叫 getUser() 向伺服器確認。
 * - 網路錯誤一律回 { user: null, offline: true }，呼叫端不得因此導向登入頁或登出。
 */
export async function getAuthUserOfflineSafe(): Promise<{ user: User | null; offline: boolean }> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user) return { user: data.session.user, offline: false };
  } catch {
    return { user: null, offline: true };
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { user: null, offline: true };
  }

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      const msg = String(error.message || "").toLowerCase();
      const networkish =
        msg.includes("fetch") || msg.includes("network") || msg.includes("timeout") || msg.includes("failed");
      return { user: null, offline: networkish };
    }
    return { user: data.user ?? null, offline: false };
  } catch {
    return { user: null, offline: true };
  }
}
