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
 * 幣別/匯率判斷：優先使用訂單快照，快照為 null 時 fallback 館別現值。
 * 注意「非台幣不抽成」僅在 currency_at_booking 快照存在且非 TWD 時成立。
 */
export function resolveOrderCurrency(
  order: OwnerSettlementOrderInput,
  fallback?: AccommodationCurrencyFallback | null,
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
  const fbCode = (fallback?.secondary_currency || "").trim().toUpperCase();
  const fbRate = Number(fallback?.secondary_currency_rate);
  if (fbCode && fbCode !== "TWD" && Number.isFinite(fbRate) && fbRate > 0) {
    return { currency: fbCode, rate: fbRate, isForeign: false, fromSnapshot: false };
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
 */
export function computeOwnerSettlementRows<T extends OwnerSettlementOrderInput>(
  orders: T[],
  config: OwnerSettlementConfig,
  month: Date,
  currencyFallback?: AccommodationCurrencyFallback | null,
): OwnerSettlementRow<T>[] {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const exemptSet = new Set((config.exempt_order_sources ?? []).map((s) => s));

  const rows: OwnerSettlementRow<T>[] = [];
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
    const commission = exempt ? 0 : monthCommissionable * (config.commission_rate / 100);

    rows.push({
      order: o,
      nightsInMonth,
      totalNights,
      monthRatio: ratio,
      monthFinal,
      monthDiscount,
      monthCommissionable,
      commission,
      exempt,
      currency: resolved.currency,
      exchangeRate: resolved.rate,
      isForeign: resolved.currency !== "TWD",
      monthFinalOriginal,
    });
  }
  return rows;
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
): OwnerSettlementTotals {
  const totalRevenue = rows.reduce((s, r) => s + r.monthFinal, 0);
  const totalCommissionable = rows.reduce((s, r) => s + r.monthCommissionable, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commission, 0);
  const marketingFee =
    config.marketing_fee_base +
    Math.max(0, propertyCount - 1) * config.marketing_fee_per_extra_property;
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
 * 抽成基礎 = final_price - 加購項目總額；人客多抽成 = 抽成基礎 × rate；
 * 溢價分潤 = guest_count × 300 ÷ 2；業主淨收益 = final_price - 平台費用合計。
 */
export function computeGuestCountRows<T extends GuestCountOrderInput>(
  orders: T[],
  config: OwnerSettlementConfig,
  month: Date,
  currencyFallback?: AccommodationCurrencyFallback | null,
): GuestCountRow<T>[] {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const exemptSet = new Set(config.exempt_order_sources ?? []);
  const rate = (config.commission_rate ?? 0) / 100;

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
    const commission = exempt ? 0 : commissionBase * rate;
    const premiumShare = exempt ? 0 : (Number(o.guest_count || 0) * PREMIUM_SHARE_PER_GUEST) / 2;
    const platformFeeTotal = commission + premiumShare;

    rows.push({
      order: o,
      finalPrice,
      addonTotal,
      commissionBase,
      commission,
      premiumShare,
      platformFeeTotal,
      ownerNet: finalPrice - platformFeeTotal,
      isCrossMonth,
      exempt,
      currency: resolved.currency,
      exchangeRate: resolved.rate,
      isForeign: resolved.currency !== "TWD",
      finalPriceOriginal,
      addonTotalOriginal,
    });
  }
  return rows;
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
    totalCommissionBase: sum((r) => r.commissionBase),
    totalCommission: sum((r) => r.commission),
    totalPremiumShare: sum((r) => r.premiumShare),
    totalPlatformFee: sum((r) => r.platformFeeTotal),
    ownerNet: sum((r) => r.ownerNet),
    crossMonthCount: rows.filter((r) => r.isCrossMonth).length,
  };
}
