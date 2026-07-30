import { addDays, differenceInDays, endOfMonth, parseISO, startOfMonth } from "date-fns";

export type RevenueBreakdownType = "standard" | "guestcount";

export interface OwnerSettlementConfig {
  commission_rate: number;
  marketing_fee_base: number;
  marketing_fee_per_extra_property: number;
  exempt_order_sources: string[];
  revenue_breakdown_type?: RevenueBreakdownType;
}

export const DEFAULT_OWNER_SETTLEMENT_CONFIG: OwnerSettlementConfig = {
  commission_rate: 15,
  marketing_fee_base: 53000,
  marketing_fee_per_extra_property: 3000,
  exempt_order_sources: [],
  revenue_breakdown_type: "standard",
};

/* ===================== 門檻式收費規則（owner_settlement_pricing_rules） ===================== */

/**
 * 門檻式收費規則（費率一律小數存法：0.10 = 10%，計算時禁止再除以 100）。
 * 來源優先序：owner_settlement_pricing_rules（該館別 effective_from <= 報表月份的最新一筆）
 * → 無資料時由舊制 system_settings.owner_settlement_config 組出等義規則。
 */
export interface OwnerPricingRule {
  /** 基礎抽成費率（小數） */
  commission_rate: number;
  /** 抽成門檻；> 0 時只對超過門檻的部分抽成，0 = 全額抽成（與舊制一致） */
  commission_threshold: number;
  /** 未達行銷費門檻時的行銷推廣費 */
  marketing_fee_low: number;
  /** 超過行銷費門檻時的行銷推廣費 */
  marketing_fee_high: number;
  /** 行銷費門檻；0 = 恆用 marketing_fee_low（與舊制一致） */
  marketing_fee_threshold: number;
  /** 預留欄位，目前恆為 false，不實作任何隨門檻改變費率的邏輯 */
  tier_rate_enabled: boolean;
  exempt_order_sources: string[];
  revenue_breakdown_type: RevenueBreakdownType;
  /** 舊制的「每多一棟加收」，僅在 marketing_fee_threshold = 0 時沿用 */
  marketing_fee_per_extra_property: number;
  /** true = 來自 owner_settlement_pricing_rules（新制） */
  fromTable: boolean;
  effective_from?: string | null;
}

/** 由舊制 config 組出等義的規則物件（threshold = 0，行為與修改前完全一致） */
export function pricingRuleFromLegacyConfig(config: OwnerSettlementConfig): OwnerPricingRule {
  return {
    commission_rate: (Number(config.commission_rate) || 0) / 100, // 舊制存百分比，統一轉小數
    commission_threshold: 0,
    marketing_fee_low: Number(config.marketing_fee_base) || 0,
    marketing_fee_high: Number(config.marketing_fee_base) || 0,
    marketing_fee_threshold: 0,
    tier_rate_enabled: false,
    exempt_order_sources: config.exempt_order_sources ?? [],
    revenue_breakdown_type: getRevenueBreakdownType(config),
    marketing_fee_per_extra_property: Number(config.marketing_fee_per_extra_property) || 0,
    fromTable: false,
  };
}

/** 把資料表的一列轉成規則物件（費率已是小數，不再除以 100） */
export function pricingRuleFromRow(
  row: Record<string, any>,
  legacyConfig: OwnerSettlementConfig,
): OwnerPricingRule {
  const sources = Array.isArray(row.exempt_order_sources)
    ? (row.exempt_order_sources as string[])
    : legacyConfig.exempt_order_sources ?? [];
  return {
    commission_rate: Number(row.commission_rate) || 0,
    commission_threshold: Number(row.commission_threshold) || 0,
    marketing_fee_low: Number(row.marketing_fee_low) || 0,
    marketing_fee_high: Number(row.marketing_fee_high) || 0,
    marketing_fee_threshold: Number(row.marketing_fee_threshold) || 0,
    tier_rate_enabled: !!row.tier_rate_enabled,
    exempt_order_sources: sources,
    revenue_breakdown_type:
      row.revenue_breakdown_type === "guestcount"
        ? "guestcount"
        : row.revenue_breakdown_type === "standard"
          ? "standard"
          : getRevenueBreakdownType(legacyConfig),
    marketing_fee_per_extra_property: Number(legacyConfig.marketing_fee_per_extra_property) || 0,
    fromTable: true,
    effective_from: row.effective_from ?? null,
  };
}

/**
 * 查詢該館別、報表月份適用的最新生效規則。
 * 查詢邏輯：effective_from <= 報表月份月初，依 effective_from desc, created_at desc 取第一筆。
 * 無資料時 fallback 舊制 config。
 */
export async function resolvePricingRule(
  client: { from: (t: string) => any },
  accommodationId: string,
  month: Date,
  legacyConfig: OwnerSettlementConfig,
): Promise<OwnerPricingRule> {
  if (!accommodationId) return pricingRuleFromLegacyConfig(legacyConfig);
  const monthStart = formatMonthStart(month);
  try {
    const { data } = await client
      .from("owner_settlement_pricing_rules")
      .select("*")
      .eq("accommodation_id", accommodationId)
      .lte("effective_from", monthStart)
      .order("effective_from", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return pricingRuleFromRow(data, legacyConfig);
  } catch {
    /* 讀取失敗一律 fallback 舊制，避免整頁壞掉 */
  }
  return pricingRuleFromLegacyConfig(legacyConfig);
}

/** 取某月的月初日期字串（YYYY-MM-01） */
export function formatMonthStart(month: Date): string {
  const y = month.getFullYear();
  const m = String(month.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/**
 * 門檻超額係數：threshold = 0 時回傳 1（全額抽成，與舊制完全一致）；
 * 營收 <= threshold 回傳 0；否則回傳 (營收 − threshold) / 營收，
 * 讓每筆訂單依比例分攤「只對超額部分抽成」的結果，總計與公式一致。
 */
export function commissionThresholdFactor(revenueBase: number, threshold: number): number {
  if (!threshold || threshold <= 0) return 1;
  if (revenueBase <= 0) return 0;
  if (revenueBase <= threshold) return 0;
  return (revenueBase - threshold) / revenueBase;
}

/**
 * 行銷推廣費：
 * - marketing_fee_threshold > 0：門檻二選一（營收 < 門檻用 low、>= 門檻用 high）
 * - marketing_fee_threshold = 0：沿用舊制 marketing_fee_low + (棟數 − 1) × 每多一棟加收
 */
export function resolveMarketingFee(
  rule: OwnerPricingRule,
  revenueBase: number,
  propertyCount: number,
): number {
  if (rule.marketing_fee_threshold > 0) {
    return revenueBase >= rule.marketing_fee_threshold ? rule.marketing_fee_high : rule.marketing_fee_low;
  }
  return rule.marketing_fee_low + Math.max(0, propertyCount - 1) * rule.marketing_fee_per_extra_property;
}

/** 讀取拆解類型，未設定時視為 standard */
export function getRevenueBreakdownType(config: Partial<OwnerSettlementConfig> | null | undefined): RevenueBreakdownType {
  return config?.revenue_breakdown_type === "guestcount" ? "guestcount" : "standard";
}


/** 溢價分潤：每人 300 元的一半 */
export const PREMIUM_SHARE_PER_GUEST = 300;

/** 從 orders.custom_addon_details（jsonb array）加總「全部」加購項目 total（含清潔費、接機車資等） */
export function extractAddonTotal(customAddonDetails: unknown): number {
  if (!Array.isArray(customAddonDetails)) return 0;
  let sum = 0;
  for (const item of customAddonDetails) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    sum += Number(rec.total ?? 0) || 0;
  }
  return sum;
}


export interface OwnerSettlementOrderInput {
  check_in_date: string;
  check_out_date: string;
  final_price: number | string | null;
  discount_amount?: number | string | null;
  order_source?: string | null;
  owner_direct?: boolean | null;
  /** 建單當下幣別快照（null = 舊訂單，fallback 館別現值） */
  currency_at_booking?: string | null;
  /** 建單當下匯率快照（外幣 per TWD，例：JPY 5.02） */
  exchange_rate_snapshot?: number | string | null;
}

/** 館別現值（快照為 null 時的 fallback 來源） */
export interface AccommodationCurrencyFallback {
  secondary_currency?: string | null;
  secondary_currency_rate?: number | string | null;
}

export interface ResolvedOrderCurrency {
  /** 該筆訂單金額實際的幣別（TWD 或外幣代碼） */
  currency: string;
  /** 外幣 per TWD（例：JPY 5.02）；TWD 訂單為 1 */
  rate: number;
  /** 是否為非台幣訂單（依快照判斷；快照為 null 才 fallback 館別現值） */
  isForeign: boolean;
  /** 快照是否存在（false = 使用館別現值 fallback） */
  fromSnapshot: boolean;
}

/**
 * 幣別/匯率判斷：只認訂單自身的快照。
 * 快照為 null（舊訂單）一律視為台幣 —— 館別的 secondary_currency 只是「參考顯示幣別」，
 * 不代表訂單金額是外幣，不可用來回溯換算，否則台幣訂單會被誤除以匯率。
 */
export function resolveOrderCurrency(
  order: OwnerSettlementOrderInput,
  _fallback?: AccommodationCurrencyFallback | null,
): ResolvedOrderCurrency {
  const snapCode = (order.currency_at_booking || "").trim().toUpperCase();
  if (snapCode) {
    const snapRate = Number(order.exchange_rate_snapshot);
    return {
      currency: snapCode,
      rate: Number.isFinite(snapRate) && snapRate > 0 ? snapRate : 1,
      isForeign: snapCode !== "TWD",
      fromSnapshot: true,
    };
  }
  return { currency: "TWD", rate: 1, isForeign: false, fromSnapshot: false };
}


/** 外幣金額換算台幣：TWD = 原幣別金額 ÷ 匯率（匯率為「外幣 per TWD」） */
export function convertToTwd(amount: number, resolved: ResolvedOrderCurrency): number {
  if (resolved.currency === "TWD" || !resolved.rate || resolved.rate <= 0) return amount;
  return amount / resolved.rate;
}

export interface OwnerSettlementRow<T extends OwnerSettlementOrderInput = OwnerSettlementOrderInput> {
  order: T;
  nightsInMonth: number;
  totalNights: number;
  monthRatio: number;
  /** 台幣金額（外幣訂單已換算） */
  monthFinal: number;
  monthDiscount: number;
  monthCommissionable: number;
  commission: number;
  exempt: boolean;
  /** 幣別資訊 */
  currency: string;
  exchangeRate: number;
  isForeign: boolean;
  /** 原幣別的本月營收（台幣訂單等同 monthFinal） */
  monthFinalOriginal: number;
}


/**
 * 純函式：把訂單依當月夜數分攤，套用 exempt 規則後計算抽成。
 * 抽離自 OwnerSettlement 頁面，任何角色只要拿到相同 config + orders，
 * 就會得到完全相同的金額，避免 RLS/讀取權限造成的差異。
 *
 * rule：門檻式收費規則（可省略 → 由 config 組出等義的舊制規則，threshold = 0，
 * 計算結果與修改前完全一致）。
 */
export function computeOwnerSettlementRows<T extends OwnerSettlementOrderInput>(
  orders: T[],
  config: OwnerSettlementConfig,
  month: Date,
  currencyFallback?: AccommodationCurrencyFallback | null,
  rule?: OwnerPricingRule | null,
): OwnerSettlementRow<T>[] {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const effectiveRule = rule ?? pricingRuleFromLegacyConfig(config);
  const exemptSet = new Set(effectiveRule.exempt_order_sources ?? []);

  interface Draft {
    row: OwnerSettlementRow<T>;
  }
  const drafts: Draft[] = [];
  for (const o of orders) {
    const ci = parseISO(o.check_in_date);
    const co = parseISO(o.check_out_date);
    const totalNights = Math.max(1, differenceInDays(co, ci));
    let nightsInMonth = 0;
    for (let i = 0; i < totalNights; i++) {
      const d = addDays(ci, i);
      if (d >= monthStart && d <= monthEnd) nightsInMonth++;
    }
    if (nightsInMonth === 0) continue;

    const resolved = resolveOrderCurrency(o, currencyFallback);
    const ratio = nightsInMonth / totalNights;
    const monthFinalOriginal = Number(o.final_price || 0) * ratio;
    const monthFinal = convertToTwd(monthFinalOriginal, resolved);
    const monthDiscount = convertToTwd(Number(o.discount_amount || 0) * ratio, resolved);
    const monthCommissionable = monthFinal;
    const exempt =
      !!o.owner_direct ||
      (o.order_source ? exemptSet.has(o.order_source) : false) ||
      resolved.isForeign;

    drafts.push({
      row: {
        order: o,
        nightsInMonth,
        totalNights,
        monthRatio: ratio,
        monthFinal,
        monthDiscount,
        monthCommissionable,
        commission: 0,
        exempt,
        currency: resolved.currency,
        exchangeRate: resolved.rate,
        isForeign: resolved.currency !== "TWD",
        monthFinalOriginal,
      },
    });
  }

  // 業績門檻基礎：未扣加購的當月營收，排除非台幣 / exempt 訂單
  const thresholdBase = drafts.reduce((s, d) => s + (d.row.exempt ? 0 : d.row.monthFinal), 0);
  const factor = commissionThresholdFactor(thresholdBase, effectiveRule.commission_threshold);
  for (const d of drafts) {
    d.row.commission = d.row.exempt ? 0 : d.row.monthCommissionable * effectiveRule.commission_rate * factor;
  }
  return drafts.map((d) => d.row);
}

/** standard 型的業績門檻基礎：未扣加購、排除非台幣 / exempt 訂單的當月營收 */
export function getStandardThresholdBase(rows: OwnerSettlementRow[]): number {
  return rows.reduce((s, r) => s + (r.exempt ? 0 : r.monthFinal), 0);
}

export interface OwnerSettlementTotals {
  totalRevenue: number;
  totalCommissionable: number;
  totalCommission: number;
  marketingFee: number;
}

export function computeOwnerSettlementTotals(
  rows: OwnerSettlementRow[],
  config: OwnerSettlementConfig,
  propertyCount: number,
  rule?: OwnerPricingRule | null,
): OwnerSettlementTotals {
  const effectiveRule = rule ?? pricingRuleFromLegacyConfig(config);
  const totalRevenue = rows.reduce((s, r) => s + r.monthFinal, 0);
  const totalCommissionable = rows.reduce((s, r) => s + r.monthCommissionable, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commission, 0);
  const marketingFee = resolveMarketingFee(
    effectiveRule,
    getStandardThresholdBase(rows),
    propertyCount,
  );
  return { totalRevenue, totalCommissionable, totalCommission, marketingFee };
}


/* ===================== guestcount 型（旅行日六館） ===================== */

export interface GuestCountOrderInput extends OwnerSettlementOrderInput {
  guest_count?: number | null;
  custom_addon_details?: unknown;
}

export interface GuestCountRow<T extends GuestCountOrderInput = GuestCountOrderInput> {
  order: T;
  /** 以下金額皆為台幣（外幣訂單已依匯率換算） */
  finalPrice: number;
  addonTotal: number;
  commissionBase: number;
  commission: number;
  premiumShare: number;
  platformFeeTotal: number;
  ownerNet: number;
  isCrossMonth: boolean;
  exempt: boolean;
  currency: string;
  exchangeRate: number;
  isForeign: boolean;
  /** 原幣別實付金額 */
  finalPriceOriginal: number;
  addonTotalOriginal: number;
}

/**
 * guestcount 型：以「入住月份」為單位全額計算一次，不做跨月 ratio 分攤。
 * 抽成基礎 = final_price - 加購項目總額；人客多抽成 = 抽成基礎 × rate × 門檻超額係數；
 * 溢價分潤 = guest_count × 300 ÷ 2；業主淨收益 = final_price - 平台費用合計。
 *
 * rule 省略時等同舊制（threshold = 0），結果與修改前完全一致。
 */
export function computeGuestCountRows<T extends GuestCountOrderInput>(
  orders: T[],
  config: OwnerSettlementConfig,
  month: Date,
  currencyFallback?: AccommodationCurrencyFallback | null,
  rule?: OwnerPricingRule | null,
): GuestCountRow<T>[] {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const effectiveRule = rule ?? pricingRuleFromLegacyConfig(config);
  const exemptSet = new Set(effectiveRule.exempt_order_sources ?? []);
  const rate = effectiveRule.commission_rate;

  const rows: GuestCountRow<T>[] = [];
  for (const o of orders) {
    const ci = parseISO(o.check_in_date);
    // 只在入住月份計算一次
    if (ci < monthStart || ci > monthEnd) continue;

    const co = parseISO(o.check_out_date);
    const isCrossMonth =
      ci.getFullYear() !== co.getFullYear() || ci.getMonth() !== co.getMonth();

    const resolved = resolveOrderCurrency(o, currencyFallback);
    const finalPriceOriginal = Number(o.final_price || 0);
    const addonTotalOriginal = extractAddonTotal(o.custom_addon_details);
    const finalPrice = convertToTwd(finalPriceOriginal, resolved);
    const addonTotal = convertToTwd(addonTotalOriginal, resolved);
    const commissionBase = finalPrice - addonTotal;
    const exempt =
      !!o.owner_direct ||
      (o.order_source ? exemptSet.has(o.order_source) : false) ||
      resolved.isForeign;
    const premiumShare = exempt ? 0 : (Number(o.guest_count || 0) * PREMIUM_SHARE_PER_GUEST) / 2;

    rows.push({
      order: o,
      finalPrice,
      addonTotal,
      commissionBase,
      commission: 0,
      premiumShare,
      platformFeeTotal: premiumShare,
      ownerNet: finalPrice - premiumShare,
      isCrossMonth,
      exempt,
      currency: resolved.currency,
      exchangeRate: resolved.rate,
      isForeign: resolved.currency !== "TWD",
      finalPriceOriginal,
      addonTotalOriginal,
    });
  }

  // 業績門檻基礎：未扣加購的當月營收（final_price 全額），排除非台幣 / exempt 訂單
  const thresholdBase = getGuestCountThresholdBase(rows);
  const factor = commissionThresholdFactor(thresholdBase, effectiveRule.commission_threshold);
  for (const r of rows) {
    r.commission = r.exempt ? 0 : r.commissionBase * rate * factor;
    r.platformFeeTotal = r.commission + r.premiumShare;
    r.ownerNet = r.finalPrice - r.platformFeeTotal;
  }
  return rows;
}

/** guestcount 型的業績門檻基礎：未扣加購、排除非台幣 / exempt 訂單的當月營收 */
export function getGuestCountThresholdBase(rows: GuestCountRow[]): number {
  return rows.reduce((s, r) => s + (r.exempt ? 0 : r.finalPrice), 0);
}



export interface GuestCountTotals {
  totalRevenue: number;
  totalAddonTotal: number;
  totalCommissionBase: number;
  totalCommission: number;
  totalPremiumShare: number;
  totalPlatformFee: number;
  ownerNet: number;
  crossMonthCount: number;
}

export function computeGuestCountTotals(rows: GuestCountRow[]): GuestCountTotals {
  const sum = (f: (r: GuestCountRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  return {
    totalRevenue: sum((r) => r.finalPrice),
    totalAddonTotal: sum((r) => r.addonTotal),
    totalCommissionBase: sum((r) => (r.exempt ? 0 : r.commissionBase)),
    totalCommission: sum((r) => r.commission),
    totalPremiumShare: sum((r) => r.premiumShare),
    totalPlatformFee: sum((r) => r.platformFeeTotal),
    ownerNet: sum((r) => r.ownerNet),
    crossMonthCount: rows.filter((r) => r.isCrossMonth).length,
  };
}
