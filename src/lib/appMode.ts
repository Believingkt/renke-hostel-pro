/**
 * 應用模式（前台 / PMS 後台）判斷。
 *
 * - pms.lakeze.com      → "pms"（民宿後台入口）
 * - booking.lakeze.com  → "frontend"（訂房前台，行為完全不變）
 * - 開發 / 預覽網域      → 預設 "neutral"（不套任何守衛，方便測試）
 *                          可用 ?mode=pms / ?mode=frontend 切換，記在 sessionStorage
 */

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
 */
const PMS_RESERVED_FIRST = new Set([
  "admin",
  "auth",
  "login",
  "reset-password",
  "change-password",
  "hq",
  "hq-auth",
  "headquarters",
  "team",
  "team-auth",
]);

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

export function isPmsAllowedPath(pathname: string): boolean {
  const normalized = normalizePmsPath(pathname) || "/";
  if (normalized === "/admin" || normalized.startsWith("/admin/")) return true;
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
