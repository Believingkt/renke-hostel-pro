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
}

export interface OwnerSettlementRow<T extends OwnerSettlementOrderInput = OwnerSettlementOrderInput> {
  order: T;
  nightsInMonth: number;
  totalNights: number;
  monthRatio: number;
  monthFinal: number;
  monthDiscount: number;
  monthCommissionable: number;
  commission: number;
  exempt: boolean;
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

    const ratio = nightsInMonth / totalNights;
    const monthFinal = Number(o.final_price || 0) * ratio;
    const monthDiscount = Number(o.discount_amount || 0) * ratio;
    const monthCommissionable = monthFinal;
    const exempt = !!o.owner_direct || (o.order_source ? exemptSet.has(o.order_source) : false);
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
  cleaningFee: number;
  commissionBase: number;
  commission: number;
  premiumShare: number;
  platformFeeTotal: number;
  ownerNet: number;
  isCrossMonth: boolean;
  exempt: boolean;
}

/**
 * guestcount 型：以「入住月份」為單位全額計算一次，不做跨月 ratio 分攤。
 * 抽成基礎 = final_price - 清潔費；人客多抽成 = 抽成基礎 × rate；
 * 溢價分潤 = guest_count × 300 ÷ 2；業主淨收益 = final_price - 平台費用合計。
 */
export function computeGuestCountRows<T extends GuestCountOrderInput>(
  orders: T[],
  config: OwnerSettlementConfig,
  month: Date,
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

    const finalPrice = Number(o.final_price || 0);
    const cleaningFee = extractCleaningFee(o.custom_addon_details);
    const commissionBase = finalPrice - cleaningFee;
    const exempt = !!o.owner_direct || (o.order_source ? exemptSet.has(o.order_source) : false);
    const commission = exempt ? 0 : commissionBase * rate;
    const premiumShare = exempt ? 0 : (Number(o.guest_count || 0) * PREMIUM_SHARE_PER_GUEST) / 2;
    const platformFeeTotal = commission + premiumShare;

    rows.push({
      order: o,
      cleaningFee,
      commissionBase,
      commission,
      premiumShare,
      platformFeeTotal,
      ownerNet: finalPrice - platformFeeTotal,
      isCrossMonth,
      exempt,
    });
  }
  return rows;
}

export interface GuestCountTotals {
  totalRevenue: number;
  totalCleaningFee: number;
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
    totalRevenue: sum((r) => Number(r.order.final_price || 0)),
    totalCleaningFee: sum((r) => r.cleaningFee),
    totalCommissionBase: sum((r) => r.commissionBase),
    totalCommission: sum((r) => r.commission),
    totalPremiumShare: sum((r) => r.premiumShare),
    totalPlatformFee: sum((r) => r.platformFeeTotal),
    ownerNet: sum((r) => r.ownerNet),
    crossMonthCount: rows.filter((r) => r.isCrossMonth).length,
  };
}
