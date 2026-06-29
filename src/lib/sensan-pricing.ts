// 森山民宿 包區方案定價表（共用：詳情頁 CapacityPriceLadder 與 /booking 列表卡）
// 改價請只動這支檔案。

export type SensanPricingTier = "weekday" | "friday_sunday" | "weekend";

export interface SensanTierIncludeItem {
  text: string;
  available: "yes" | "no" | "optional";
  price_note?: string;
}

export interface SensanTierPrice {
  guestCount: number;
  original: number;
  sale: number;
  roomAllocation: string;
  isFewPeople?: boolean;
  /** 可選：直接綁定該方案要下單的房型 id（包區方案資料驅動時使用） */
  roomTypeId?: string;
  /** 可選：accommodation_packages.id，下單時寫入 orders.package_id */
  packageId?: string;
  /** 可選：方案名稱（資料驅動時可帶入，沒帶就 fallback "{n} 人包區方案"） */
  planName?: string;
  /** 副標 */
  subtitle?: string | null;
  /** 人數上限 */
  guestCountMax?: number | null;
  /** 兒童相關 */
  childCountMax?: number | null;
  childAgeNote?: string | null;
  /** 標籤 */
  tags?: string[];
  /** 附加說明 */
  includes?: SensanTierIncludeItem[];
  /** 房型分配（資料驅動）：[{room_type_id, qty}]，用於前台顯示縮圖。 */
  roomTypeAllocation?: Array<{ room_type_id: string; qty: number }>;
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

// ─────────────────────────────────────────────────────────────
// 跨平/旺/假日的多晚總價計算
//  - 每一晚依當日 tier 用「該方案在當日 tier 的價格」相加
//  - 若該方案在當日 tier「沒開 / 沒價」，fallback 用當日所有有開方案中最低 sale 總價
//  - 若整個當日 tier 都沒有方案，最終 fallback 用此方案自身 sale（避免 0）
// ─────────────────────────────────────────────────────────────
export interface NightlyFallbackNote {
  date: Date;
  tier: SensanPricingTier;
  reason: "no_tier_price" | "no_open_plans";
  /** 此晚實際採用的方案名稱（fallback 來源） */
  fallbackPlanName?: string;
  /** 此晚實際採用的單晚 sale */
  fallbackSale: number;
}

/** 每晚明細（無論是否 fallback 都會列入，供備註展開使用） */
export interface NightlyBreakdownItem {
  date: Date;
  tier: SensanPricingTier;
  /** 是否走 fallback（本方案在該晚不適用） */
  isFallback: boolean;
  /** 該晚實際採用的方案名稱（若 fallback 則為替代方案名稱） */
  planName?: string;
  /** 該晚實際採用的單晚 sale */
  sale: number;
  /** 該晚採用的單晚 original（無折扣前） */
  original: number;
}

export interface NightlyTotalsResult {
  totalSale: number;
  totalOriginal: number;
  fallbackNotes: NightlyFallbackNote[];
  breakdown: NightlyBreakdownItem[];
}

export function computeNightlyPackageTotals(args: {
  selectedTier: SensanTierPrice;
  checkIn: Date | null | undefined;
  nights: number;
  pricingTable: Record<SensanPricingTier, SensanTierPrice[]>;
  isHolidayDate?: (d: Date | null | undefined) => boolean | undefined;
}): NightlyTotalsResult {
  const { selectedTier, checkIn, nights, pricingTable, isHolidayDate } = args;
  const safeNights = Math.max(1, nights);

  // 沒有實際入住日 → 退回原本「sale × N」單一 tier 計算
  if (!checkIn) {
    return {
      totalSale: selectedTier.sale * safeNights,
      totalOriginal: (selectedTier.original ?? selectedTier.sale) * safeNights,
      fallbackNotes: [],
      breakdown: [],
    };
  }

  let totalSale = 0;
  let totalOriginal = 0;
  const fallbackNotes: NightlyFallbackNote[] = [];
  const breakdown: NightlyBreakdownItem[] = [];

  for (let i = 0; i < safeNights; i++) {
    const d = new Date(checkIn);
    d.setDate(d.getDate() + i);
    const nightTier = detectSensanTierByDate(d);
    const effectiveTier: SensanPricingTier = isHolidayDate?.(d) ? "weekend" : nightTier;
    const candidates = pricingTable[effectiveTier] || [];

    // 1) 同方案在當日 tier 是否有開（用 planName + guestCount，或 roomTypeId 比對）
    const sameInThisTier = candidates.find((t) => {
      if (selectedTier.roomTypeId && t.roomTypeId) {
        return t.roomTypeId === selectedTier.roomTypeId && t.guestCount === selectedTier.guestCount;
      }
      if (selectedTier.planName && t.planName) {
        return t.planName === selectedTier.planName && t.guestCount === selectedTier.guestCount;
      }
      return t.guestCount === selectedTier.guestCount && t.isFewPeople === selectedTier.isFewPeople;
    });

    if (sameInThisTier && sameInThisTier.sale > 0) {
      totalSale += sameInThisTier.sale;
      totalOriginal += sameInThisTier.original ?? sameInThisTier.sale;
      breakdown.push({
        date: d,
        tier: effectiveTier,
        isFallback: false,
        planName: sameInThisTier.planName || selectedTier.planName,
        sale: sameInThisTier.sale,
        original: sameInThisTier.original ?? sameInThisTier.sale,
      });
      continue;
    }

    // 2) Fallback：當日所有有開方案中最低 sale
    const openPlans = candidates.filter((t) => t.sale > 0);
    if (openPlans.length > 0) {
      const cheapest = openPlans.reduce((a, b) => (a.sale < b.sale ? a : b));
      totalSale += cheapest.sale;
      totalOriginal += cheapest.original ?? cheapest.sale;
      const cheapestName = cheapest.planName || `${cheapest.guestCount} 人方案`;
      fallbackNotes.push({
        date: d,
        tier: effectiveTier,
        reason: "no_tier_price",
        fallbackPlanName: cheapestName,
        fallbackSale: cheapest.sale,
      });
      breakdown.push({
        date: d,
        tier: effectiveTier,
        isFallback: true,
        planName: cheapestName,
        sale: cheapest.sale,
        original: cheapest.original ?? cheapest.sale,
      });
      continue;
    }

    // 3) 最終 fallback：用自身 sale 避免 0
    totalSale += selectedTier.sale;
    totalOriginal += selectedTier.original ?? selectedTier.sale;
    fallbackNotes.push({
      date: d,
      tier: effectiveTier,
      reason: "no_open_plans",
      fallbackSale: selectedTier.sale,
    });
    breakdown.push({
      date: d,
      tier: effectiveTier,
      isFallback: true,
      planName: selectedTier.planName,
      sale: selectedTier.sale,
      original: selectedTier.original ?? selectedTier.sale,
    });
  }

  return { totalSale, totalOriginal, fallbackNotes, breakdown };
}

