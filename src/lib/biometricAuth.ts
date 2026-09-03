// Face ID / Touch ID 快速登入（僅 Capacitor iOS App）
//
// - refresh token 存 iOS Keychain（NativeBiometric.setCredentials），不進 localStorage
// - localStorage 只存「是否啟用」與「是否已詢問過」兩個非敏感旗標
// - session 失效時：先生物辨識 → 取 Keychain refresh token → supabase.auth.setSession

import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "capacitor-native-biometric";
import { supabase } from "@/integrations/supabase/client";

const SERVER = "com.lakeze.booking.member";
const ENABLED_KEY = "biometric_login_enabled";
const ASKED_KEY = "biometric_login_prompt_asked";
const MANUAL_LOGOUT_KEY = "member_manual_logout";

/** 使用者主動登出旗標：設定後禁止任何自動還原 session */
export function setManualLogoutFlag(): void {
  try {
    localStorage.setItem(MANUAL_LOGOUT_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearManualLogoutFlag(): void {
  try {
    localStorage.removeItem(MANUAL_LOGOUT_KEY);
  } catch {
    /* ignore */
  }
}

export function isManualLogout(): boolean {
  try {
    return localStorage.getItem(MANUAL_LOGOUT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Keychain 是否還有可用憑證 */
export async function hasStoredBiometricCredentials(): Promise<boolean> {
  if (!isBiometricPlatform()) return false;
  try {
    const creds = await NativeBiometric.getCredentials({ server: SERVER });
    return !!creds?.password;
  } catch {
    return false;
  }
}


/** 只在原生 iOS App 內提供 */
export function isBiometricPlatform(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
}

/** 裝置是否支援且已設定生物辨識 */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!isBiometricPlatform()) return false;
  try {
    const res = await NativeBiometric.isAvailable({ useFallback: false });
    return !!res?.isAvailable;
  } catch {
    return false;
  }
}

export function isBiometricEnabled(): boolean {
  if (!isBiometricPlatform()) return false;
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function hasAskedBiometricPrompt(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) === "1";
  } catch {
    return true;
  }
}

export function markBiometricPromptAsked(): void {
  try {
    localStorage.setItem(ASKED_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** 啟用：驗證身分後，把目前 session 的 refresh token 寫入 Keychain */
export async function enableBiometricLogin(): Promise<void> {
  if (!isBiometricPlatform()) throw new Error("此裝置不支援 Face ID 快速登入");
  if (!(await isBiometricAvailable())) throw new Error("請先於裝置設定中啟用 Face ID / Touch ID");

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.refresh_token) throw new Error("登入狀態已失效，請重新登入後再啟用");

  await NativeBiometric.verifyIdentity({
    reason: "啟用 Face ID 快速登入",
    title: "驗證身分",
    subtitle: "人客多",
    description: "確認是本人後即可啟用快速登入",
  });

  await NativeBiometric.setCredentials({
    username: session.user?.email || session.user?.id || "member",
    password: session.refresh_token,
    server: SERVER,
  });

  try {
    localStorage.setItem(ENABLED_KEY, "1");
    localStorage.setItem(ASKED_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** 每次成功換發 session 後同步最新 refresh token（已啟用時才做） */
export async function refreshStoredBiometricToken(): Promise<void> {
  if (!isBiometricEnabled()) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.refresh_token) return;
    await NativeBiometric.setCredentials({
      username: session.user?.email || session.user?.id || "member",
      password: session.refresh_token,
      server: SERVER,
    });
  } catch (e) {
    console.warn("[biometric] refresh stored token failed", e);
  }
}

/** 關閉並清除 Keychain（登出／刪除帳號也會呼叫） */
export async function disableBiometricLogin(): Promise<void> {
  try {
    localStorage.removeItem(ENABLED_KEY);
  } catch {
    /* ignore */
  }
  if (!isBiometricPlatform()) return;
  try {
    await NativeBiometric.deleteCredentials({ server: SERVER });
  } catch {
    /* Keychain 沒資料時忽略 */
  }
}

/**
 * session 失效時嘗試以 Face ID 還原登入。
 * 成功回 true；不支援／未啟用／使用者取消／token 失效回 false（由呼叫端導回一般登入頁）。
 */
export async function tryBiometricRestoreSession(): Promise<boolean> {
  if (!isBiometricEnabled()) return false;
  if (!(await isBiometricAvailable())) return false;

  try {
    await NativeBiometric.verifyIdentity({
      reason: "使用 Face ID 登入人客多",
      title: "Face ID 登入",
      subtitle: "人客多",
      description: "驗證後即可回到您的帳號",
    });
  } catch {
    return false; // 取消或驗證失敗
  }

  let refreshToken: string | undefined;
  try {
    const creds = await NativeBiometric.getCredentials({ server: SERVER });
    refreshToken = creds?.password;
  } catch {
    refreshToken = undefined;
  }
  if (!refreshToken) {
    await disableBiometricLogin();
    return false;
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: "",
    refresh_token: refreshToken,
  });

  if (error || !data?.session) {
    // refresh token 已失效 → 清掉 Keychain，回一般登入
    await disableBiometricLogin();
    return false;
  }

  await refreshStoredBiometricToken();
  return true;
}
