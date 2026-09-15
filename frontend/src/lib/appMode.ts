/**
 * 應用模式（前台 / PMS 後台）判斷。
 *
 * - pms.lakeze.com      → "pms"（民宿後台入口）
 * - booking.lakeze.com  → "frontend"（訂房前台，行為完全不變）
 * - 開發 / 預覽網域      → 預設 "neutral"（不套任何守衛，方便測試）
 *                          可用 ?mode=pms / ?mode=frontend 切換，記在 sessionStorage
 */

import { PMS_RESERVED_FIRST_SEGMENT_SET } from "@/lib/reservedRoutes";

export const PMS_ORIGIN = "https://pms.lakeze.com";
export const BOOKING_ORIGIN = "https://booking.lakeze.com";
/** 密碼重設信固定回到 PMS 網域（勿用 window.location.origin 硬拼） */
export const PMS_RESET_PASSWORD_URL = `${PMS_ORIGIN}/reset-password`;

export const PMS_HOSTS = ["pms.lakeze.com", "www.pms.lakeze.com"] as const;
export const BOOKING_HOSTS = ["booking.lakeze.com", "www.booking.lakeze.com"] as const;

const MODE_STORAGE_KEY = "app_mode_override";

export type AppMode = "pms" | "frontend" | "neutral";

export function isPmsHost(hostname = window.location.hostname): boolean {
  return (PMS_HOSTS as readonly string[]).includes(hostname.toLowerCase());
}

export function isBookingHost(hostname = window.location.hostname): boolean {
  return (BOOKING_HOSTS as readonly string[]).includes(hostname.toLowerCase());
}

function isDevOrPreviewHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.includes("lovableproject.com") ||
    h.includes("lovable.app")
  );
}

/** 讀取（並記住）開發/預覽環境的模式覆寫 */
function readModeOverride(): AppMode | null {
  try {
    const param = new URLSearchParams(window.location.search).get("mode");
    if (param === "pms" || param === "frontend") {
      sessionStorage.setItem(MODE_STORAGE_KEY, param);
      return param;
    }
    const saved = sessionStorage.getItem(MODE_STORAGE_KEY);
    if (saved === "pms" || saved === "frontend") return saved;
  } catch {
    /* ignore */
  }
  return null;
}

export function resolveAppMode(hostname = window.location.hostname): AppMode {
  if (isPmsHost(hostname)) return "pms";
  // 原生 APP：僅在「明確指定 PMS」時才進後台模式；否則沿用既有 booking/neutral 行為
  if (isNativePmsApp()) return "pms";
  if (isDevOrPreviewHost(hostname)) return readModeOverride() ?? "neutral";
  return "frontend";
}

export function isPmsMode(hostname = window.location.hostname): boolean {
  return resolveAppMode(hostname) === "pms";
}

function devModeHref(path: string, mode: "pms" | "frontend"): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.delete("mode");
  url.searchParams.set("mode", mode);
  try {
    sessionStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  return url.toString();
}

/** 以 PMS 網域開啟指定路徑；開發/預覽環境改為同站切換模式 */
export function pmsHref(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (isDevOrPreviewHost(window.location.hostname)) return devModeHref(p, "pms");
  return `${PMS_ORIGIN}${p}`;
}

/** 以訂房前台網域開啟指定路徑；開發/預覽環境改為同站切換模式 */
export function bookingHref(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (isDevOrPreviewHost(window.location.hostname)) return devModeHref(p, "frontend");
  return `${BOOKING_ORIGIN}${p}`;
}

/**
 * PMS 網域允許的路徑（其餘一律導回前台網域）
 * 支援 /{slug}/admin/... 形式，會先剝掉 alias 前綴再判斷。
 *
 * 保留字唯一來源：src/lib/reservedRoutes.ts（PMS 清單為全站清單的子集）。
 */
const PMS_RESERVED_FIRST = PMS_RESERVED_FIRST_SEGMENT_SET;

export function normalizePmsPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  // 僅在 /{alias}/admin... 或 /{alias}/auth 這種形式時剝除 alias 前綴，避免誤判前台路徑
  if (
    segments.length >= 2 &&
    !PMS_RESERVED_FIRST.has(segments[0]) &&
    (segments[1] === "admin" || segments[1] === "auth")
  ) {
    return "/" + segments.slice(1).join("/");
  }
  return pathname;
}

/** /team、/team-auth（含子路徑）已搬到 PMS 網域 */
export function isTeamPath(pathname: string): boolean {
  return (
    pathname === "/team" ||
    pathname.startsWith("/team/") ||
    pathname === "/team-auth" ||
    pathname.startsWith("/team-auth/")
  );
}

export function isPmsAllowedPath(pathname: string): boolean {
  const normalized = normalizePmsPath(pathname) || "/";
  if (normalized === "/admin" || normalized.startsWith("/admin/")) return true;
  if (isTeamPath(normalized)) return true;
  return (
    normalized === "/login" ||
    normalized === "/auth" ||
    normalized === "/reset-password" ||
    normalized === "/change-password"
  );
}

/** 判斷路徑（剝掉 alias 後）是否為後台頁 */
export function isAdminPath(pathname: string): boolean {
  const normalized = normalizePmsPath(pathname);
  return normalized === "/admin" || normalized.startsWith("/admin/");
}

/** 取出路徑中的民宿代號（alias），若第一段為保留字則回傳 null */
export function extractAliasFromPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  if (PMS_RESERVED_FIRST.has(segments[0])) return null;
  return segments[0];
}

/** PMS 後台：記住使用者最後切換的民宿代號，重新登入時自動恢復 */
export const LAST_PROPERTY_ALIAS_KEY = "pms_last_property_alias";

/**
 * 是否執行於 Capacitor 原生 App（iOS / Android WebView）。
 * 原生環境的 hostname 是 localhost / capacitor:，無法用網域判斷，
 * 因此一律視為訂房平台（等同 booking.lakeze.com 的行為）。
 */
let cachedNativeApp = false;
export function isNativeApp(): boolean {
  if (cachedNativeApp) return true;
  if (typeof window === "undefined") return false;
  try {
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.() === true) {
      cachedNativeApp = true;
      return true;
    }
    const protocol = window.location.protocol.toLowerCase();
    if (protocol === "capacitor:" || protocol === "ionic:") {
      cachedNativeApp = true;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/* ──────────────────────────────────────────────────────────────
 * 原生 APP 目標（Native Booking / Native PMS）
 *
 * 背景：原生 WebView 的 hostname 是 localhost / capacitor:，無法用網域判斷模式。
 * 既有行為：原生一律等同訂房前台（booking）。此為預設值，不得改變。
 *
 * 新增能力：可「明確指定」原生 APP 以 PMS 後台為入口，供未來獨立 PMS APP 使用。
 * 指定方式（優先序）：
 *   1) build-time：VITE_NATIVE_APP_TARGET=pms（獨立打包 PMS APP 時設定）
 *   2) runtime：localStorage `native_app_target` = "pms"（內部測試用）
 * 未設定時一律回 "booking"，正式 APP 預設入口完全不變。
 * ────────────────────────────────────────────────────────────── */

export type NativeAppTarget = "booking" | "pms";

export const NATIVE_APP_TARGET_KEY = "native_app_target";

export function getNativeAppTarget(): NativeAppTarget {
  try {
    const buildTarget = String(import.meta.env?.VITE_NATIVE_APP_TARGET ?? "").toLowerCase();
    if (buildTarget === "pms") return "pms";
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(NATIVE_APP_TARGET_KEY);
      if (saved === "pms") return "pms";
    }
  } catch {
    /* ignore */
  }
  return "booking";
}

/** 僅供內部測試切換；正式 APP 預設入口不受影響 */
export function setNativeAppTarget(target: NativeAppTarget): void {
  try {
    if (target === "booking") window.localStorage.removeItem(NATIVE_APP_TARGET_KEY);
    else window.localStorage.setItem(NATIVE_APP_TARGET_KEY, target);
  } catch {
    /* ignore */
  }
}

/** 原生 APP 且以訂房前台為入口（＝現行預設行為） */
export function isNativeBookingApp(): boolean {
  return isNativeApp() && getNativeAppTarget() === "booking";
}

/** 原生 APP 且被明確指定為 PMS 後台入口 */
export function isNativePmsApp(): boolean {
  return isNativeApp() && getNativeAppTarget() === "pms";
}
