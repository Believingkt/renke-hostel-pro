// iOS App 推播通知（Capacitor + APNs 直連，未使用 Firebase）。
// 網頁版完全不受影響：所有動作都會先檢查是否在原生 App 環境。
import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "@/lib/appMode";
import { toast } from "sonner";

/** 暫時除錯用：把 catch 到的錯誤完整顯示出來（同時保留 console log） */
function debugToast(label: string, e: unknown) {
  let detail = "";
  try {
    detail =
      (e as any)?.message ??
      (e as any)?.errorMessage ??
      (e as any)?.error ??
      (typeof e === "string" ? e : JSON.stringify(e));
  } catch {
    detail = String(e);
  }
  toast.error(`${label}: ${detail || "unknown error"}`, { duration: 15000 });
}

const DENIED_KEY = "push_permission_denied";

export type PushPermissionState = "granted" | "denied" | "prompt" | "unsupported";

/** 使用者曾拒絕過通知權限 → 不再重複跳窗 */
export function isPushDenied(): boolean {
  try {
    return localStorage.getItem(DENIED_KEY) === "1";
  } catch {
    return false;
  }
}

function markDenied(denied: boolean) {
  try {
    if (denied) localStorage.setItem(DENIED_KEY, "1");
    else localStorage.removeItem(DENIED_KEY);
  } catch {
    /* ignore */
  }
}

async function loadPlugin() {
  if (!isNativeApp()) return null;
  try {
    const mod = await import("@capacitor/push-notifications");
    return mod.PushNotifications;
  } catch (e) {
    console.warn("[push] plugin unavailable", e);
    return null;
  }
}

async function saveToken(token: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const platform = /android/i.test(navigator.userAgent) ? "android" : "ios";
  await supabase
    .from("device_tokens")
    .upsert(
      {
        user_id: user.id,
        token,
        platform,
        is_active: true,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    );
}

let listenersBound = false;

/**
 * App 啟動或會員登入後呼叫：
 * - 已允許 → 直接 register()，每次啟動都 upsert token（token 可能輪替）
 * - 尚未詢問過 → requestPermissions() 跳出系統詢問
 * - 曾被拒絕 → 跳過（除非 force，由「開啟訂單通知」按鈕觸發）
 */
export async function initPushNotifications(
  options?: { force?: boolean },
): Promise<PushPermissionState> {
  const PushNotifications = await loadPlugin();
  if (!PushNotifications) return "unsupported";

  try {
    let perm = await PushNotifications.checkPermissions();
    console.log("[push] current permission:", perm.receive);

    if (perm.receive !== "granted") {
      if (isPushDenied() && !options?.force) return "denied";
      if (perm.receive === "denied" && !options?.force) {
        markDenied(true);
        return "denied";
      }
      perm = await PushNotifications.requestPermissions();
      console.log("[push] permission after request:", perm.receive);
    }

    if (perm.receive !== "granted") {
      markDenied(true);
      return "denied";
    }
    markDenied(false);

    if (!listenersBound) {
      listenersBound = true;
      PushNotifications.addListener("registration", (t) => {
        console.log("[push] APNs token received (len)", t.value?.length);
        saveToken(t.value).catch((e) => console.error("[push] save token failed", e));
      });
      PushNotifications.addListener("registrationError", (err) => {
        console.error(
          "[push] registration error",
          (err as any)?.error ?? err,
          JSON.stringify(err ?? {}),
        );
      });
    }
    await PushNotifications.register();
    console.log("[push] register() called");
    return "granted";
  } catch (e) {
    console.error("[push] init failed", e);
    return "unsupported";
  }
}

/** App 啟動時：偵測到既有會員 session 就初始化推播（不限剛登入） */
export async function bootstrapPushForExistingSession(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    await initPushNotifications();
  } catch (e) {
    console.error("[push] bootstrap failed", e);
  }
}

/** 目前的通知權限狀態（供「我的帳號」顯示） */
export async function getPushPermissionState(): Promise<PushPermissionState> {
  const PushNotifications = await loadPlugin();
  if (!PushNotifications) return "unsupported";
  try {
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === "granted") return "granted";
    if (perm.receive === "denied") return "denied";
    return "prompt";
  } catch {
    return "unsupported";
  }
}

/** 登出時停用此裝置的 token（避免推播寄到別人的手機） */
export async function deactivateCurrentDeviceTokens(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("device_tokens")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
  } catch (e) {
    console.error("[push] deactivate failed", e);
  }
}
