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

export const CLEANING_FEE_ADDON_TYPE = "清潔費";

/** 從 orders.custom_addon_details（jsonb array）精確比對 addon_type = '清潔費' 並加總 total */
export function extractCleaningFee(customAddonDetails: unknown): number {
  if (!Array.isArray(customAddonDetails)) return 0;
  let sum = 0;
  for (const item of customAddonDetails) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (rec.addon_type === CLEANING_FEE_ADDON_TYPE) {
      sum += Number(rec.total ?? 0) || 0;
    }
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
