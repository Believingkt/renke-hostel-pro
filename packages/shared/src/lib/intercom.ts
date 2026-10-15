/// <reference types="vite/client" />
/**
 * Intercom Messenger（Fin）載入與設定：純函式 + 薄包裝，供 IntercomMessenger 與「聯絡客服」按鈕使用。
 * 沒有 VITE_INTERCOM_APP_ID → 一律不載入、不發任何請求。
 */
import { supabase } from "@lakeze/shared/integrations/supabase/client";

type IntercomFn = ((...args: unknown[]) => void) & { q?: unknown[][]; c?: (args: unknown[]) => void };

declare global {
  interface Window {
    Intercom?: IntercomFn;
    intercomSettings?: Record<string, unknown>;
  }
}

export const INTERCOM_API_BASE = "https://api-iam.intercom.io";
export const INTERCOM_WIDGET_BASE = "https://widget.intercom.io/widget/";

export function getIntercomAppId(): string | null {
  const v = (import.meta.env.VITE_INTERCOM_APP_ID as string | undefined)?.trim();
  return v ? v : null;
}

export type IntercomRole = "owner" | "hq" | "guest";

/** 依路由判斷身分情境：/admin、/:alias/admin → owner；/hq、/headquarters、/team → hq；其餘為前台 guest */
export function classifyIntercomRoute(pathname: string): IntercomRole {
  const seg = pathname.split("/").filter(Boolean);
  const first = seg[0]?.toLowerCase();
  if (first === "hq" || first === "headquarters" || first === "team") return "hq";
  if (first === "admin" || seg[1]?.toLowerCase() === "admin") return "owner";
  return "guest";
}

export interface IntercomIdentity {
  user_id: string;
  user_hash?: string;
  email?: string;
  name?: string;
}

export function buildIntercomSettings(args: {
  appId: string;
  native: boolean;
  role: IntercomRole;
  identity: IntercomIdentity | null;
  accommodationId?: string | null;
}): Record<string, unknown> {
  const { appId, native, role, identity, accommodationId } = args;
  return {
    app_id: appId,
    api_base: INTERCOM_API_BASE,
    language_override: "zh-TW",
    // 網頁版不帶 alignment，位置依 Intercom 後台 Launcher Position；App 隱藏浮動啟動器（改由「訊息」Tab 開啟）
    ...(native ? { hide_default_launcher: true } : {}),
    ...(identity
      ? {
          user_id: identity.user_id,
          ...(identity.user_hash ? { user_hash: identity.user_hash } : {}),
          ...(identity.email ? { email: identity.email } : {}),
          ...(identity.name ? { name: identity.name } : {}),
          role,
          ...(role !== "guest" && accommodationId ? { accommodation_id: accommodationId } : {}),
        }
      : {}),
  };
}

/** 官方 loader：先建立指令佇列，再非同步插入 widget script（只插一次） */
export function loadIntercomScript(appId: string): void {
  if (window.Intercom) return;
  const ic: IntercomFn = (...args: unknown[]) => ic.c!(args);
  ic.q = [];
  ic.c = (args) => ic.q!.push(args);
  window.Intercom = ic;
  const s = document.createElement("script");
  s.type = "text/javascript";
  s.async = true;
  s.src = INTERCOM_WIDGET_BASE + encodeURIComponent(appId);
  s.dataset.intercomLoader = "1";
  document.head.appendChild(s);
}

export function intercomCall(...args: unknown[]): void {
  window.Intercom?.(...args);
}

/** 「聯絡客服」按鈕用 */
export function showIntercom(): void {
  intercomCall("show");
}

// user_hash 記憶體快取：同一 session 內同一 user 不重打
const hashCache = new Map<string, Promise<string | null>>();

export function clearIntercomHashCache(): void {
  hashCache.clear();
}

export function fetchIntercomUserHash(userId: string): Promise<string | null> {
  const cached = hashCache.get(userId);
  if (cached) return cached;
  const p = supabase.functions
    .invoke("intercom-user-hash", { method: "POST" })
    .then(({ data, error }) => {
      if (error || !data?.user_hash || data.user_id !== userId) throw error ?? new Error("invalid user_hash response");
      return data.user_hash as string;
    })
    .catch((e) => {
      console.warn("[Intercom] user_hash 取得失敗", e);
      hashCache.delete(userId);
      return null;
    });
  hashCache.set(userId, p);
  return p;
}
