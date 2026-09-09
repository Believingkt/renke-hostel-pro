// iOS App 推播通知（Capacitor + APNs 直連，未使用 Firebase）。
// 網頁版完全不受影響：所有動作都會先檢查是否在原生 App 環境。
import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "@/lib/appMode";
import { bumpUnreadCount } from "@/lib/appBadge";

/** 內部除錯紀錄：只寫 console，不打擾使用者 */
function debugLog(label: string, e: unknown) {
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
  console.error(`[push] ${label}: ${detail || "unknown error"}`);
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
    debugLog("推播外掛載入失敗", e);
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
    return false;
  }
  if (!session?.user) {
    const message = "No active member session after waiting for auth hydration";
    console.error(`[push] ${message}`);
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
    return false;
  }
  console.log("[push] device token saved", token.slice(0, 8));
  return true;
}


let listenersBound = false;
const registrationWaiters = new Set<(saved: boolean) => void>();

/* ---------- 前景收到推播：更新未讀狀態 ---------- */

const UNREAD_KEY = "push_unread";

export interface ReceivedPush {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  receivedAt: string;
}

const PUSH_EVENT = "lakeze:push-received";

/** 是否有未讀推播（前景收到後標記，開啟訊息頁可清除） */
export function hasUnreadPush(): boolean {
  try {
    return localStorage.getItem(UNREAD_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPushRead() {
  try {
    localStorage.removeItem(UNREAD_KEY);
  } catch {
    /* ignore */
  }
}

/** 訂閱前景推播（回傳取消訂閱函式） */
export function subscribePushReceived(handler: (p: ReceivedPush) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<ReceivedPush>).detail);
  window.addEventListener(PUSH_EVENT, listener);
  return () => window.removeEventListener(PUSH_EVENT, listener);
}

function emitReceived(payload: ReceivedPush) {
  try {
    localStorage.setItem(UNREAD_KEY, "1");
  } catch {
    /* ignore */
  }
  // App icon 角標 +1（背景時由 APNs payload 的 aps.badge 負責）
  void bumpUnreadCount(1);
  window.dispatchEvent(new CustomEvent<ReceivedPush>(PUSH_EVENT, { detail: payload }));
}


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
        debugLog("APNs 註冊失敗", (err as any)?.error ?? err);
        registrationWaiters.forEach((resolve) => resolve(false));
        registrationWaiters.clear();
      });
      // 前景收到推播：系統橫幅由 presentationOptions 呈現，這裡只同步未讀狀態
      PushNotifications.addListener("pushNotificationReceived", (n) => {
        emitReceived({
          title: n.title ?? "",
          body: n.body ?? "",
          data: (n.data ?? {}) as Record<string, unknown>,
          receivedAt: new Date().toISOString(),
        });
      });
      // 使用者點開推播（背景／鎖屏）：同樣視為有新訊息
      PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
        emitReceived({
          title: a.notification?.title ?? "",
          body: a.notification?.body ?? "",
          data: (a.notification?.data ?? {}) as Record<string, unknown>,
          receivedAt: new Date().toISOString(),
        });
      });
    }

    const saveCompleted = new Promise<boolean>((resolve) => {
      registrationWaiters.add(resolve);
      window.setTimeout(() => {
        if (!registrationWaiters.delete(resolve)) return;
        resolve(false);
      }, 15000);
    });
    await PushNotifications.register();
    console.log("[push] register() called");
    await saveCompleted;
    return "granted";
  } catch (e) {
    console.error("[push] init failed", e);
    debugLog("推播初始化失敗", e);
    return "unsupported";
  }
}

/** App 啟動時：偵測到既有會員 session 就初始化推播（不限剛登入） */
export async function bootstrapPushForExistingSession(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      console.log("[push] 啟動註冊略過：尚未登入會員");
      return;
    }
    const state = await initPushNotifications();
    console.log("[push] 啟動註冊完成：權限", state);
  } catch (e) {
    console.error("[push] bootstrap failed", e);
    debugLog("推播啟動檢查失敗", e);
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
    debugLog("查詢通知權限失敗", e);
    return "unsupported";
  }
}

/**
 * 本裝置（目前登入會員）是否已有有效的推播 token
 * 查詢失敗時不再靜默當作「沒有 token」，而是丟出錯誤讓上層顯示 toast。
 */
export async function hasActiveDeviceToken(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return false;
  const { data, error } = await supabase
    .from("device_tokens")
    .select("id")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .limit(1);
  if (error) {
    console.error("[push] hasActiveDeviceToken query failed", error);
    throw new Error(`讀取通知狀態失敗：${error.message}`);
  }
  return (data?.length ?? 0) > 0;
}

/**
 * 通知開關的真實狀態：系統權限 granted 且本裝置有有效 token → true
 * 供「訊息」與「我的帳號」兩顆開關共用，確保顯示一致。
 * retries：token upsert 可能稍慢於 register() 回傳，允許短暫輪詢重查。
 * 查詢錯誤會往上拋，由 UI 顯示失敗 toast。
 */
export async function isPushEnabled(options?: { retries?: number; delayMs?: number }): Promise<boolean> {
  const state = await getPushPermissionState();
  if (state !== "granted") return false;
  const retries = options?.retries ?? 0;
  const delayMs = options?.delayMs ?? 700;
  for (let i = 0; i <= retries; i++) {
    if (await hasActiveDeviceToken()) return true;
    if (i < retries) await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}



/** 登出時停用此裝置的 token（避免推播寄到別人的手機） */
export async function deactivateCurrentDeviceTokens(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    // 沒有 session（例如已登出）時直接略過，避免被 RLS 擋下而出現假失敗
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    await supabase
      .from("device_tokens")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", session.user.id);
  } catch (e) {
    console.warn("[push] deactivate failed", e);
  }
}
