// App icon 角標（未讀訊息數）。僅在 Capacitor 原生環境作用，網頁版全部 no-op。
import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "@/lib/appMode";
import { getMessagesUnreadTotal, markCategoriesRead } from "@/lib/messagesUnread";

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
  if (!Badge) return;
  try {
    const perm = await Badge.checkPermissions();
    if (perm.display !== "granted") {
      const req = await Badge.requestPermissions();
      if (req.display !== "granted") return;
    }
    if (safe > 0) await Badge.set({ count: safe });
    else await Badge.clear();
  } catch (e) {
    console.warn("[badge] set failed", e);
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

/** 由伺服器未讀數同步角標（App 啟動 / 回前景） */
export async function syncBadgeFromServer(): Promise<number> {
  const remote = await fetchServerUnreadCount();
  const count = remote ?? getLocalUnreadCount();
  await setAppBadge(count);
  return count;
}

/** 前景收到推播：未讀 +1 並更新角標 */
export async function bumpUnreadCount(delta = 1): Promise<number> {
  const next = Math.max(0, getLocalUnreadCount() + delta);
  await setAppBadge(next);
  return next;
}

/** 全部已讀：伺服器與本地同時歸零 */
export async function markAllMessagesRead(): Promise<void> {
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
