/**
 * 保留路徑（第一層 segment）唯一 Source of Truth。
 *
 * 背景：ConditionalLayout / Auth.tsx / appMode.ts 原本各自維護一份清單且內容不同，
 * 造成 alias 前綴（/{alias}/admin）判斷不一致。此檔統一定義，其他檔案一律 import。
 *
 * 兩份清單的關係必須維持「PMS ⊆ APP」：
 *  - PMS_RESERVED_FIRST_SEGMENTS：PMS 網域用來剝除 alias 前綴（僅後台相關路徑）。
 *  - RESERVED_FIRST_SEGMENTS：全站（含前台）用來判斷 /{alias}/... 是否帶 alias 前綴。
 */

/** PMS 後台相關的保留字（appMode.normalizePmsPath / extractAliasFromPath 使用） */
export const PMS_RESERVED_FIRST_SEGMENTS = [
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
] as const;

/** 前台專屬的保留字（不屬於後台入口，但也不可被當成民宿 alias） */
const FRONTEND_RESERVED_FIRST_SEGMENTS = [
  "booking",
  "book",
  "member",
  "ai-booking",
  "order-search",
  "profile",
  "payment-test",
  "kol-api-docs",
  "points-api-docs",
  "pay",
  "payment-result",
  "og-preview",
  "saas",
  "__cb",
] as const;

/** 全站保留字（PMS ∪ 前台），ConditionalLayout / Auth 使用 */
export const RESERVED_FIRST_SEGMENTS: readonly string[] = [
  ...PMS_RESERVED_FIRST_SEGMENTS,
  ...FRONTEND_RESERVED_FIRST_SEGMENTS,
];

export const RESERVED_FIRST_SEGMENT_SET: ReadonlySet<string> = new Set(RESERVED_FIRST_SEGMENTS);

export const PMS_RESERVED_FIRST_SEGMENT_SET: ReadonlySet<string> = new Set(
  PMS_RESERVED_FIRST_SEGMENTS,
);

/** 路徑第一段是否為保留字（非民宿 alias） */
export function isReservedFirstSegment(segment: string): boolean {
  return RESERVED_FIRST_SEGMENT_SET.has(segment);
}
