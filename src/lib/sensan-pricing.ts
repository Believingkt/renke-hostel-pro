// 森山民宿 包區方案定價表（共用：詳情頁 CapacityPriceLadder 與 /booking 列表卡）
// 改價請只動這支檔案。

export type SensanPricingTier = "weekday" | "friday_sunday" | "weekend";

export interface SensanTierPrice {
  guestCount: number;
  original: number;
  sale: number;
  roomAllocation: string;
  isFewPeople?: boolean;
}

export const SENSAN_PRICING_TABLE: Record<SensanPricingTier, SensanTierPrice[]> = {
  weekday: [
    { guestCount: 6, original: 18000, sale: 14999, roomAllocation: "雙人房 3 間", isFewPeople: true },
    { guestCount: 8, original: 24000, sale: 19999, roomAllocation: "雙人房 1 間 · 四人房 2 間", isFewPeople: true },
    { guestCount: 12, original: 47000, sale: 35250, roomAllocation: "四人房 3 間" },
    { guestCount: 14, original: 54000, sale: 40500, roomAllocation: "雙人房 1 間 · 四人房 3 間" },
    { guestCount: 16, original: 57000, sale: 42750, roomAllocation: "雙人房 2 間 · 四人房 3 間" },
    { guestCount: 18, original: 60000, sale: 45000, roomAllocation: "雙人房 3 間 · 四人房 3 間" },
  ],
  friday_sunday: [
    { guestCount: 12, original: 47000, sale: 35250, roomAllocation: "四人房 3 間" },
    { guestCount: 14, original: 54000, sale: 40500, roomAllocation: "雙人房 1 間 · 四人房 3 間" },
    { guestCount: 16, original: 57000, sale: 42750, roomAllocation: "雙人房 2 間 · 四人房 3 間" },
    { guestCount: 18, original: 60000, sale: 45000, roomAllocation: "雙人房 3 間 · 四人房 3 間" },
  ],
  weekend: [
    { guestCount: 12, original: 58000, sale: 43500, roomAllocation: "四人房 3 間" },
    { guestCount: 14, original: 66000, sale: 49500, roomAllocation: "雙人房 1 間 · 四人房 3 間" },
    { guestCount: 16, original: 69000, sale: 51750, roomAllocation: "雙人房 2 間 · 四人房 3 間" },
    { guestCount: 18, original: 72000, sale: 54000, roomAllocation: "雙人房 3 間 · 四人房 3 間" },
  ],
};

export function detectSensanTierByDate(date: Date | null | undefined): SensanPricingTier {
  const d = date ?? new Date();
  const day = d.getDay();
  if (day === 6) return "weekend"; // 週六
  if (day === 5 || day === 0) return "friday_sunday"; // 週五/週日
  return "weekday"; // 週一~四
}

/** 判斷給定的住宿是否為森山（依名稱關鍵字） */
export function isSensanAccommodation(name?: string | null): boolean {
  if (!name) return false;
  return /森山|sensan/i.test(name);
}

/**
 * 從 PRICING_TABLE 找最適合人數的方案：
 * - 完全相符 > 大於等於人數中最便宜
 * - 找不到（人數超過 18）→ null
 */
export function pickSensanTier(
  guests: number,
  tier: SensanPricingTier
): SensanTierPrice | null {
  const table = SENSAN_PRICING_TABLE[tier];
  const exact = table.find((t) => t.guestCount === guests);
  if (exact) return exact;
  const candidates = table.filter((t) => t.guestCount >= guests);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, cur) => (cur.sale < best.sale ? cur : best));
}

/** 取該時段的最低/最高包區方案（最低 = 6 人早鳥；最高 = 18 人整棟） */
export function getSensanRangeForTier(tier: SensanPricingTier) {
  const table = SENSAN_PRICING_TABLE[tier];
  const min = table.reduce((a, b) => (a.sale < b.sale ? a : b));
  const max = table.reduce((a, b) => (a.guestCount > b.guestCount ? a : b));
  return { min, max };
}
