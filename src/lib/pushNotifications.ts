// iOS App 推播通知（Capacitor + APNs 直連，未使用 Firebase）。
// 網頁版完全不受影響：所有動作都會先檢查是否在原生 App 環境。
import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "@/lib/appMode";

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

let registered = false;

/**
 * 會員登入成功後呼叫：請求通知權限 → register() → 取得 APNs token 存入 device_tokens。
 * 被拒絕過就直接跳過，不再重複跳窗。
 */
export async function initPushNotifications(): Promise<PushPermissionState> {
  const PushNotifications = await loadPlugin();
  if (!PushNotifications) return "unsupported";
  if (isPushDenied()) return "denied";

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") {
      markDenied(true);
      return "denied";
    }
    markDenied(false);

    if (!registered) {
      registered = true;
      PushNotifications.addListener("registration", (t) => {
        saveToken(t.value).catch((e) => console.error("[push] save token failed", e));
      });
      PushNotifications.addListener("registrationError", (err) => {
        console.error("[push] registration error", err);
      });
    }
    await PushNotifications.register();
    return "granted";
  } catch (e) {
    console.error("[push] init failed", e);
    return "unsupported";
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
