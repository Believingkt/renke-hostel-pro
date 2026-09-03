// App icon 角標（未讀訊息數）。僅在 Capacitor 原生環境作用，網頁版全部 no-op。
import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "@/lib/appMode";
import {
  getMessagesUnreadTotal,
  initMessagesUnread,
  isMessagesUnreadLoaded,
  markCategoriesRead,
} from "@/lib/messagesUnread";

const LOCAL_KEY = "push_unread_count";
const BADGE_EVENT = "lakeze:badge-changed";

async function loadPlugin() {
  if (!isNativeApp()) return null;
  try {
    const mod = await import("@capawesome/capacitor-badge");
    return mod.Badge;
  } catch (e) {
    console.warn("[badge] plugin unavailable", e);
    return null;
  }
}

/** 診斷：插件是否註冊、是否支援、權限狀態（必要時請求權限） */
export async function logBadgeDiagnostics(): Promise<void> {
  if (!isNativeApp()) {
    console.log("[badge] web environment — badge disabled");
    return;
  }
  const Badge = await loadPlugin();
  if (!Badge) {
    console.error("[badge] plugin NOT registered (檢查 iOS Package.swift / packageClassList 是否含 BadgePlugin，並執行 npx cap sync ios)");
    return;
  }
  try {
    const supported = await Badge.isSupported();
    console.log("[badge] isSupported =", supported);
    let perm = await Badge.checkPermissions();
    console.log("[badge] checkPermissions =", perm);
    if (perm.display !== "granted") {
      perm = await Badge.requestPermissions();
      console.log("[badge] requestPermissions =", perm);
    }
  } catch (e) {
    console.error("[badge] diagnostics failed", e);
  }
}


/** 本地快取的未讀數（畫面即時顯示用） */
export function getLocalUnreadCount(): number {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function persistLocal(count: number) {
  try {
    if (count > 0) localStorage.setItem(LOCAL_KEY, String(count));
    else localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<number>(BADGE_EVENT, { detail: count }));
}

/** 訂閱未讀數變動（回傳取消訂閱函式） */
export function subscribeUnreadCount(handler: (count: number) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<number>).detail);
  window.addEventListener(BADGE_EVENT, listener);
  return () => window.removeEventListener(BADGE_EVENT, listener);
}

/** 設定 App icon 角標（同時更新本地快取） */
export async function setAppBadge(count: number): Promise<void> {
  const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  persistLocal(safe);
  const Badge = await loadPlugin();
  if (!Badge) {
    publishBadgeSyncDiagnostic({
      timestamp: new Date().toISOString(),
      count: safe,
      success: false,
      message: "Badge plugin unavailable",
      reason: lastSyncReason,
    });
    return;
  }
  try {
    const perm = await Badge.checkPermissions();
    if (perm.display !== "granted") {
      const req = await Badge.requestPermissions();
      console.log("[badge] requestPermissions =", req);
      if (req.display !== "granted") {
        console.warn("[badge] permission denied, skip set", safe);
        publishBadgeSyncDiagnostic({
          timestamp: new Date().toISOString(),
          count: safe,
          success: false,
          message: `Permission not granted: ${JSON.stringify(req)}`,
          reason: lastSyncReason,
        });
        return;
      }
    }
    console.log("[badge] Badge.set count =", safe);
    if (safe > 0) await Badge.set({ count: safe });
    else await Badge.clear();
    publishBadgeSyncDiagnostic({
      timestamp: new Date().toISOString(),
      count: safe,
      success: true,
      message: safe > 0 ? "Badge.set succeeded" : "Badge.clear succeeded",
      reason: lastSyncReason,
    });
  } catch (e) {
    console.warn("[badge] set failed", e);
    publishBadgeSyncDiagnostic({
      timestamp: new Date().toISOString(),
      count: safe,
      success: false,
      message: errorMessage(e),
      reason: lastSyncReason,
    });
  }
}

/** 角標歸零（訊息全部已讀 / 登出） */
export async function clearAppBadge(): Promise<void> {
  await setAppBadge(0);
}

/** 讀取伺服器端未讀數（推播累加的權威值） */
export async function fetchServerUnreadCount(): Promise<number | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    const { data, error } = await supabase
      .from("member_push_badges")
      .select("unread_count")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) {
      console.warn("[badge] fetch unread failed", error);
      return null;
    }
    return data?.unread_count ?? 0;
  } catch (e) {
    console.warn("[badge] fetch unread error", e);
    return null;
  }
}

/** 訊息頁未讀總數（分類未讀 + 推播未讀）並同步角標（啟動 / 回前景 / 進背景 / 未讀變動 / 收到推播） */
export async function syncBadgeFromServer(reason = "manual"): Promise<number> {
  lastSyncReason = reason;
  // 確保分類未讀在 App 啟動時就有值，不依賴訊息頁先被開啟
  if (!isMessagesUnreadLoaded()) initMessagesUnread();

  const { pushUnread: push, total } = await getBadgeUnreadCounts();
  try {
    localStorage.setItem(PUSH_KEY, String(push));
  } catch {
    /* ignore */
  }
  console.log("[badge] sync", { reason, pushUnread: push, total });

  if (total === 0 && !isMessagesUnreadLoaded()) {
    // 資料尚未載入，不要先寫 0 蓋掉既有角標
    publishBadgeSyncDiagnostic({
      timestamp: new Date().toISOString(),
      count: 0,
      success: false,
      message: "Skipped: unread data not loaded yet",
      reason,
    });
    return total;
  }

  await setAppBadge(total);
  return total;
}

const PUSH_KEY = "push_unread_only";

export function getLocalPushUnread(): number {
  try {
    const n = Number(localStorage.getItem(PUSH_KEY) ?? "0");
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export async function getBadgeUnreadCounts(): Promise<{ pushUnread: number; total: number }> {
  const remote = await fetchServerUnreadCount();
  const pushUnread = remote ?? getLocalPushUnread();
  return { pushUnread, total: getMessagesUnreadTotal(pushUnread) };
}

/** 前景收到推播：未讀 +1 並更新角標 */
export async function bumpUnreadCount(delta = 1): Promise<number> {
  lastSyncReason = "push-received";
  const push = Math.max(0, getLocalPushUnread() + delta);
  try {
    localStorage.setItem(PUSH_KEY, String(push));
  } catch {
    /* ignore */
  }
  const total = getMessagesUnreadTotal(push);
  await setAppBadge(total);
  return total;
}

/** 全部已讀：伺服器與本地同時歸零 */
export async function markAllMessagesRead(): Promise<void> {
  markCategoriesRead();
  try {
    localStorage.setItem(PUSH_KEY, "0");
  } catch {
    /* ignore */
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await supabase
        .from("member_push_badges")
        .upsert(
          { user_id: session.user.id, unread_count: 0, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
    }
  } catch (e) {
    console.warn("[badge] reset server unread failed", e);
  }
  await clearAppBadge();
}
