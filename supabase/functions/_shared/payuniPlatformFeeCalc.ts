// PAYUNi W9 平台費計算：引用業主月結頁的同一組函式（./vendor/ 由 scripts/sync-shared-vendor.mjs 逐字同步），
// 採月結頁預設（依入住夜數分攤、團購不併入）；整月訂單一起算（門檻係數與月結頁相同），只加總 PAYUNi 收款訂單。
// 另附 Ragic 算法（同 push-ragic-revenue 的公式）供核對，只做參考。
// deno-lint-ignore-file no-explicit-any
import {
  computeGuestCountRows,
  computeOwnerSettlementRows,
  getRevenueBreakdownType,
  type OwnerPricingRule,
  type OwnerSettlementConfig,
} from "./vendor/ownerSettlement.ts";
import { filterByGroupBuyMode } from "./vendor/groupBuyCaliber.ts";

export const ORDER_COLS =
  "id, order_number, check_in_date, check_out_date, total_price, discount_amount, final_price, order_status, order_source, owner_direct, room_type_id, guest_count, custom_addon_details, exchange_rate_snapshot, currency_at_booking, order_date, paid_amount, accommodation_id";

/** period YYYY-MM → 該月月初（本地時間，同月結頁 startOfMonth(parseISO(...))） */
export const monthOf = (period: string) => { const [y, m] = period.split("-").map(Number); return new Date(y, m - 1, 1); };

/** 同 OwnerSettlement.tsx 讀 system_settings.owner_settlement_config 的預設值 */
export function configFromSetting(raw: any): OwnerSettlementConfig {
  return {
    commission_rate: raw?.commission_rate ?? 15,
    marketing_fee_base: raw?.marketing_fee_base ?? 53000,
    marketing_fee_per_extra_property: raw?.marketing_fee_per_extra_property ?? 3000,
    exempt_order_sources: Array.isArray(raw?.exempt_order_sources) ? raw.exempt_order_sources : [],
    revenue_breakdown_type: getRevenueBreakdownType(raw),
  };
}

export interface FeeOrderRow {
  order_id: string; order_number: string; check_in_date: string; check_out_date: string;
  revenue: number; base: number; commission: number; premium_share: number; fee: number; exempt: boolean;
}

/** 月結頁的平台費：standard＝抽成合計；guestcount（旅行日六館）＝抽成＋溢價分潤（平台費用合計）。不含行銷推廣費 */
export function computeMonthlyPlatformFee(
  orders: any[], config: OwnerSettlementConfig, rule: OwnerPricingRule, month: Date, capMap: Record<string, number>,
) {
  const scoped = filterByGroupBuyMode(orders, "exclude");
  const type = rule.revenue_breakdown_type;
  const rows: FeeOrderRow[] = type === "guestcount"
    ? computeGuestCountRows(scoped, config, month, null, rule, capMap, "nightly").map((r: any) => ({
      order_id: r.order.id, order_number: r.order.order_number, check_in_date: r.order.check_in_date, check_out_date: r.order.check_out_date,
      revenue: r.finalPrice, base: r.exempt ? 0 : r.commissionBase, commission: r.commission, premium_share: r.premiumShare,
      fee: r.platformFeeTotal, exempt: r.exempt,
    }))
    : computeOwnerSettlementRows(scoped, config, month, null, rule, "nightly").map((r: any) => ({
      order_id: r.order.id, order_number: r.order.order_number, check_in_date: r.order.check_in_date, check_out_date: r.order.check_out_date,
      revenue: r.monthFinal, base: r.exempt ? 0 : r.monthCommissionable, commission: r.commission, premium_share: 0,
      fee: r.commission, exempt: r.exempt,
    }));
  return { type, rows, total: rows.reduce((s, r) => s + r.fee, 0) };
}

const parseDay = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, (m ?? 1) - 1, d ?? 1); };

/** 同 push-ragic-revenue accruedInMonth：取消／保留單／免抽成為 0，final_price 依夜均攤到 [monthStart, monthEnd) */
export function ragicAccrued(o: any, monthStart: Date, monthEnd: Date, isExempt: (o: any) => boolean): number {
  if (o.order_status === "cancelled" || String(o.order_status ?? "") === "hold" || isExempt(o)) return 0;
  if (!o.check_in_date || !o.check_out_date) return 0;
  const start = parseDay(o.check_in_date);
  const nights = Math.round((parseDay(o.check_out_date).getTime() - start.getTime()) / 86_400_000);
  if (nights <= 0) return 0;
  const share = (Number(o.final_price) || 0) / nights;
  let sum = 0;
  for (let i = 0; i < nights; i++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (day >= monthStart && day < monthEnd) sum += share;
  }
  return sum;
}

/** Ragic 算法：max(0, 營收 − 門檻) × 費率；整月算門檻，依各單營收占比分攤後只加總 include 內的訂單 */
export function ragicFee(
  orders: any[], fee: { rate: number; threshold: number } | null, isExempt: (o: any) => boolean,
  jpyIds: Set<string>, month: Date, include: Set<string>,
) {
  if (!fee) return { amount: 0, month_total: 0, has_setting: false };
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const acc = orders.filter((o) => !jpyIds.has(o.id)).map((o) => ({ id: o.id, v: ragicAccrued(o, month, monthEnd, isExempt) }));
  const rev = acc.reduce((s, x) => s + x.v, 0);
  const factor = rev > 0 ? Math.max(0, rev - fee.threshold) / rev : 0;
  return {
    amount: Math.round(acc.filter((x) => include.has(x.id)).reduce((s, x) => s + x.v, 0) * fee.rate * factor),
    month_total: Math.round(Math.max(0, Math.round(rev) - fee.threshold) * fee.rate),
    has_setting: true,
  };
}
