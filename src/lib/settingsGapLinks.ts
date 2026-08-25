/**
 * 館別設定完整性儀表板：缺漏格子 → HQ 設定頁跳轉連結。
 * 抽成純函式方便測試，並確保 tab／acc／focus 三個參數一致。
 */

export type GapKey =
  | "partnership"
  | "settlementRule"
  | "marketingFee"
  | "bookingSetting"
  | "legacyRate";

/** 業主月結頁可被 focus 捲動的卡片區塊 */
export type OwnerSettlementFocus = "service-fee" | "marketing-fee" | "history";

export const OWNER_SETTLEMENT_FOCUS_VALUES: OwnerSettlementFocus[] = [
  "service-fee",
  "marketing-fee",
  "history",
];

interface GapTarget {
  tab: "bonus" | "owner-settlement" | null;
  focus?: OwnerSettlementFocus;
}

export const GAP_TARGETS: Record<GapKey, GapTarget> = {
  // 合作期間的維護 UI 在「獎金發放規則（4 步流程）」第 ① 步
  partnership: { tab: "bonus" },
  settlementRule: { tab: "owner-settlement", focus: "service-fee" },
  marketingFee: { tab: "owner-settlement", focus: "marketing-fee" },
  // 訂房設定在各館後台，HQ 沒有對應頁
  bookingSetting: { tab: null },
  legacyRate: { tab: "owner-settlement", focus: "history" },
};

/** 產生 HQ 設定頁連結；沒有對應 HQ 頁面時回傳 null */
export function buildGapHref(key: GapKey, accId: string): string | null {
  const target = GAP_TARGETS[key];
  if (!target.tab) return null;
  const params = new URLSearchParams();
  params.set("tab", target.tab);
  params.set("acc", accId);
  if (target.focus) params.set("focus", target.focus);
  return `/hq/bonus-settings?${params.toString()}`;
}

export function parseOwnerSettlementFocus(raw: string | null): OwnerSettlementFocus | null {
  return OWNER_SETTLEMENT_FOCUS_VALUES.includes(raw as OwnerSettlementFocus)
    ? (raw as OwnerSettlementFocus)
    : null;
}
