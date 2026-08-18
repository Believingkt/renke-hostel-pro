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
    debugToast("推播外掛載入失敗", e);
    return null;
  }
}

async function getCurrentOrHydratedSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.user) return data.session;

  console.log("[push] session not hydrated yet; waiting for auth state once");
  return await new Promise<typeof data.session>((resolve) => {
    let settled = false;
    let subscription: { unsubscribe: () => void } | null = null;
    const finish = (session: typeof data.session) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      subscription?.unsubscribe();
      resolve(session);
    };
    const timer = window.setTimeout(() => finish(null), 10000);
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) finish(session);
    });
    subscription = listener.subscription;
  });
}

async function saveToken(token: string): Promise<boolean> {
  let session;
  try {
    session = await getCurrentOrHydratedSession();
  } catch (error) {
    console.error("[push] getSession failed", error);
    const message = error instanceof Error ? error.message : String(error);
    toast.error(message, { duration: 15000 });
    return false;
  }
  if (!session?.user) {
    const message = "No active member session after waiting for auth hydration";
    console.error(`[push] ${message}`);
    toast.error(message, { duration: 15000 });
    return false;
  }
  const platform = /android/i.test(navigator.userAgent) ? "android" : "ios";
  const { error } = await supabase
    .from("device_tokens")
    .upsert(
      {
        user_id: session.user.id,
        token,
        platform,
        is_active: true,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    );
  if (error) {
    console.error("[push] upsert device_token failed", error);
    toast.error(error.message, { duration: 15000 });
    return false;
  }
  console.log("[push] device token saved", token.slice(0, 8));
  toast.success(`saved(${token.slice(0, 4)})`, { duration: 8000 });
  return true;
}


let listenersBound = false;
const registrationWaiters = new Set<(saved: boolean) => void>();

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
      PushNotifications.addListener("registration", async (t) => {
        console.log("[push] APNs token received (len)", t.value?.length);
        const saved = await saveToken(t.value);
        registrationWaiters.forEach((resolve) => resolve(saved));
        registrationWaiters.clear();
      });
      PushNotifications.addListener("registrationError", (err) => {
        console.error(
          "[push] registration error",
          (err as any)?.error ?? err,
          JSON.stringify(err ?? {}),
        );
        debugToast("APNs 註冊失敗", (err as any)?.error ?? err);
        registrationWaiters.forEach((resolve) => resolve(false));
        registrationWaiters.clear();
      });
    }
    const saveCompleted = new Promise<boolean>((resolve) => {
      registrationWaiters.add(resolve);
      window.setTimeout(() => {
        if (!registrationWaiters.delete(resolve)) return;
        toast.error("APNs registration timed out before token upsert", { duration: 15000 });
        resolve(false);
      }, 15000);
    });
    await PushNotifications.register();
    console.log("[push] register() called");
    await saveCompleted;
    return "granted";
  } catch (e) {
    console.error("[push] init failed", e);
    debugToast("推播初始化失敗", e);
    return "unsupported";
  }
}

/** App 啟動時：偵測到既有會員 session 就初始化推播（不限剛登入） */
export async function bootstrapPushForExistingSession(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      toast.message("[push] 啟動註冊略過：尚未登入會員", { duration: 8000 });
      return;
    }
    toast.message("[push] 啟動註冊開始…", { duration: 5000 });
    const state = await initPushNotifications();
    if (state !== "granted") {
      toast.error(`[push] 啟動註冊未完成：權限 ${state}`, { duration: 10000 });
    }
  } catch (e) {
    console.error("[push] bootstrap failed", e);
    debugToast("推播啟動檢查失敗", e);
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
  } catch (e) {
    console.error("[push] checkPermissions failed", e);
    debugToast("查詢通知權限失敗", e);
    return "unsupported";
  }
}

/** 本裝置（目前登入會員）是否已有有效的推播 token */
export async function hasActiveDeviceToken(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return false;
    const { data, error } = await supabase
      .from("device_tokens")
      .select("id")
      .eq("user_id", session.user.id)
      .eq("is_active", true)
      .limit(1);
    if (error) {
      console.warn("[push] hasActiveDeviceToken failed", error);
      return false;
    }
    return (data?.length ?? 0) > 0;
  } catch (e) {
    console.warn("[push] hasActiveDeviceToken error", e);
    return false;
  }
}

/**
 * 通知開關的真實狀態：系統權限 granted 且本裝置有有效 token → true
 * 供「訊息」與「我的帳號」兩顆開關共用，確保顯示一致。
 */
export async function isPushEnabled(): Promise<boolean> {
  const state = await getPushPermissionState();
  if (state !== "granted") return false;
  return await hasActiveDeviceToken();
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
