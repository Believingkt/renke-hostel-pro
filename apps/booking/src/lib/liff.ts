/**
 * LIFF SDK 輕量載入器（僅供 /liff/* 頁面使用）
 * 未在 LINE 環境開啟時回傳 mock 模式，方便瀏覽器驗證。
 */
import { supabase } from "@lakeze/shared/integrations/supabase/client";

// deno-lint-ignore-file
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    liff?: any;
  }
}

export interface LiffProfile {
  lineUserId: string | null;
  displayName: string | null;
  isMock: boolean;
}

let sdkPromise: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (window.liff) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("LIFF SDK load failed"));
    document.head.appendChild(s);
  });
  return sdkPromise;
}

export async function fetchLiffId(): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke("line-butler-api", {
    body: { action: "config" },
  });
  if (error) return null;
  return (data as { liff_id?: string | null })?.liff_id ?? null;
}

/**
 * 初始化 LIFF。若不在 LINE 環境或無 LIFF_ID，回傳 mock（可用 ?u=Uxxxx 指定測試用 line_user_id）。
 */
export async function initLiff(): Promise<LiffProfile> {
  const params = new URLSearchParams(window.location.search);
  const mockUser = params.get("u");

  try {
    const liffId = await fetchLiffId();
    if (!liffId) throw new Error("LIFF_ID not configured");
    await loadSdk();
    await window.liff.init({ liffId });
    if (!window.liff.isInClient() && !window.liff.isLoggedIn()) {
      return { lineUserId: mockUser, displayName: null, isMock: true };
    }
    const profile = await window.liff.getProfile();
    return { lineUserId: profile.userId, displayName: profile.displayName, isMock: false };
  } catch {
    return { lineUserId: mockUser, displayName: null, isMock: true };
  }
}

export type LiffIdTokenResult =
  | { token: string }
  | { reason: "no_liff" | "no_id_token" | "token_expired" | "relogin" };

const RELOGIN_KEY = "liff_relogin_at";

/** 重新登入 LIFF 以取得新 ID token：in-client 重開 LIFF 網址，外部瀏覽器 liff.login（2 分鐘內只試一次） */
export async function reloginLiff(): Promise<boolean> {
  const liff = window.liff;
  if (!liff) return false;
  if (Date.now() - Number(sessionStorage.getItem(RELOGIN_KEY) || 0) < 120_000) return false;
  sessionStorage.setItem(RELOGIN_KEY, String(Date.now()));
  const liffId = await fetchLiffId();
  const liffUrl = liffId ? `https://liff.line.me/${liffId}?page=favorites` : window.location.href;
  if (liff.isInClient?.()) window.location.replace(liffUrl);
  else liff.login({ redirectUri: window.location.href });
  return true;
}

/** LIFF ID token（需 LIFF 開啟 openid scope）；取不到或將過期時嘗試重新登入 */
export async function ensureLiffIdToken(): Promise<LiffIdTokenResult> {
  const liff = window.liff;
  if (!liff) return { reason: "no_liff" };
  let token: string | null = null;
  let expired = false;
  try {
    if (liff.isInClient?.() || liff.isLoggedIn?.()) {
      token = liff.getIDToken?.() ?? null;
      const exp = liff.getDecodedIDToken?.()?.exp;
      expired = !!exp && exp * 1000 < Date.now() + 60_000;
    }
  } catch { /* ignore */ }
  if (token && !expired) return { token };
  if (await reloginLiff()) return { reason: "relogin" };
  return { reason: expired ? "token_expired" : "no_id_token" };
}

export async function butlerApi<T = unknown>(body: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await supabase.functions.invoke("line-butler-api", { body });
  if (error) {
    console.error("[butlerApi]", error);
    return null;
  }
  return data as T;
}
