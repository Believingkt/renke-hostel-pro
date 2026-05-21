/**
 * 共用路由匹配工具
 * 集中管理所有網域守衛（HQDomainRedirect、BookingDomainRedirect、AliasResolver、ConditionalLayout 等）
 * 共用的路徑規則，避免規則散落在各檔案造成不一致。
 */

// ============= 網域常數 =============

export const HQ_DOMAINS = ["hq.lakeze.com", "www.hq.lakeze.com"] as const;
export const BOOKING_DOMAINS = [
  "booking.lakeze.com",
  "www.booking.lakeze.com",
] as const;

// ============= 路徑常數 =============

/**
 * HQ 專屬路徑（hq.lakeze.com 與系統內部都會使用）
 */
export const HQ_PATHS = [
  "/hq",
  "/hq-auth",
  "/headquarters",
] as const;

/**
 * 系統認證／密碼相關路徑
 */
export const AUTH_PATHS = [
  "/auth",
  "/reset-password",
  "/change-password",
  "/team",
  "/team-auth",
] as const;

/**
 * 訂房入口（booking.lakeze.com）允許的路徑前綴
 */
export const BOOKING_ALLOWED_PREFIXES = [
  "/booking",
  "/book",
  "/member",
  "/order-search",
  "/order-payment",
  "/payment",
  "/linepay",
  "/public-payment",
  "/ai-booking",
] as const;

/**
 * 永不被任何網域守衛重導向的「系統保留路徑」
 * 包含 HQ 與 Auth；用於 BookingDomainRedirect 與其他守衛的白名單。
 */
export const ALWAYS_ALLOWED_PATHS = [
  ...HQ_PATHS,
  ...AUTH_PATHS,
  "/admin",
] as const;

/**
 * 第一層路徑為已知保留字時，視為非 alias 路徑（不交給 AliasResolver 處理）
 */
export const RESERVED_FIRST_SEGMENTS = new Set<string>([
  "booking",
  "book",
  "member",
  "order-search",
  "order-payment",
  "payment",
  "payment-result",
  "linepay",
  "public-payment",
  "ai-booking",
  "auth",
  "hq",
  "hq-auth",
  "headquarters",
  "admin",
  "pay",
  "profile",
  "reset-password",
  "change-password",
  "kol-api-docs",
  "points-api-docs",
  "og-preview",
  "payment-test",
  "__cb",
]);

// ============= 匹配工具 =============

/**
 * 嚴格的前綴匹配：路徑等於 prefix 或以 `prefix/` 開頭。
 * 避免 `/booking` 誤匹配 `/booking-extra` 之類的路徑。
 */
export function matchesPathPrefix(
  pathname: string,
  prefix: string
): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * 檢查 pathname 是否符合任一 prefix（嚴格邊界）
 */
export function matchesAnyPrefix(
  pathname: string,
  prefixes: readonly string[]
): boolean {
  return prefixes.some((p) => matchesPathPrefix(pathname, p));
}

/**
 * 檢查 hostname 是否屬於 HQ 網域
 */
export function isHQDomain(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (HQ_DOMAINS as readonly string[]).includes(h);
}

/**
 * 檢查 hostname 是否屬於訂房入口網域
 */
export function isBookingDomain(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (BOOKING_DOMAINS as readonly string[]).includes(h);
}

/**
 * 系統保留路徑（HQ + Auth）— 任何網域守衛都不應對其重導向
 */
export function isAlwaysAllowedPath(pathname: string): boolean {
  return matchesAnyPrefix(pathname, ALWAYS_ALLOWED_PATHS);
}

/**
 * 訂房入口允許的路徑前綴
 */
export function isBookingAllowedPath(pathname: string): boolean {
  return matchesAnyPrefix(pathname, BOOKING_ALLOWED_PREFIXES);
}

/**
 * HQ 網域允許的路徑前綴
 */
export function isHQAllowedPath(pathname: string): boolean {
  return matchesAnyPrefix(pathname, HQ_PATHS);
}

/**
 * 第一層路徑是否為保留字（非 alias）
 */
export function isReservedFirstSegment(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return false;
  return RESERVED_FIRST_SEGMENTS.has(segments[0]);
}
