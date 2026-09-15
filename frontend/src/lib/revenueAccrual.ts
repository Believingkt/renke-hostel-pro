/**
 * Shared revenue accrual utilities.
 *
 * Canonical revenue caliber for this project:
 *   - Nightly accrual: an order's `final_price` is spread evenly across its
 *     stay nights (final_price / nights). Each night's share is attributed
 *     to the calendar day that night starts on.
 *   - Excluded from revenue:
 *       * order_status === 'cancelled'
 *       * order_source === 'kol' (reciprocal/complimentary, not billed)
 *   - All other statuses (pending, hold, confirmed, checked_out, ...) count.
 *
 * Any component that displays a total revenue number MUST derive it from
 * these helpers so that "總覽" and "訂單來源分析" (and future consumers)
 * cannot drift. See `revenueAccrual.test.ts` for the invariants.
 */

export interface RevenueOrder {
  order_status?: string | null;
  order_source?: string | null;
  check_in_date?: string | null;
  check_out_date?: string | null;
  final_price?: number | null;
}

export const REVENUE_EXCLUDED_STATUSES: ReadonlySet<string> = new Set(['cancelled']);
export const REVENUE_EXCLUDED_SOURCES: ReadonlySet<string> = new Set(['kol']);

const MS_PER_DAY = 86_400_000;

/** Parse a YYYY-MM-DD (or ISO) string as a local-midnight Date. */
function parseDay(s: string): Date {
  // Take the date portion only to avoid TZ shifts from full ISO strings.
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function toDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Returns true if this order should contribute to revenue totals. */
export function isRevenueOrder(o: RevenueOrder): boolean {
  const status = (o.order_status ?? '').toString();
  if (REVENUE_EXCLUDED_STATUSES.has(status)) return false;
  const source = (o.order_source ?? '').toString();
  if (REVENUE_EXCLUDED_SOURCES.has(source)) return false;
  return true;
}

export function orderNights(o: RevenueOrder): number {
  if (!o.check_in_date || !o.check_out_date) return 0;
  const inD = parseDay(o.check_in_date);
  const outD = parseDay(o.check_out_date);
  const nights = Math.round((outD.getTime() - inD.getTime()) / MS_PER_DAY);
  return nights > 0 ? nights : 0;
}

export interface NightlyShare {
  date: string; // yyyy-MM-dd (the night's start day)
  amount: number;
}

/**
 * Return per-night revenue shares for an order, optionally clipped to a
 * [rangeStart, rangeEnd] inclusive window. Returns an empty array when the
 * order is not billable (cancelled / KOL / missing dates / zero nights).
 */
export function accrueOrderNightlyShares(
  order: RevenueOrder,
  rangeStart?: Date,
  rangeEnd?: Date,
): NightlyShare[] {
  if (!isRevenueOrder(order)) return [];
  const nights = orderNights(order);
  if (nights === 0) return [];
  const share = (Number(order.final_price) || 0) / nights;
  const start = parseDay(order.check_in_date as string);
  const rs = rangeStart ? toDay(rangeStart) : undefined;
  const re = rangeEnd ? toDay(rangeEnd) : undefined;
  const out: NightlyShare[] = [];
  for (let i = 0; i < nights; i++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (rs && day < rs) continue;
    if (re && day > re) continue;
    out.push({ date: formatISODate(day), amount: share });
  }
  return out;
}

/**
 * Fraction of the order's stay that falls inside [rangeStart, rangeEnd].
 * Returns 0 for non-billable orders. Useful for pro-rating any per-order
 * amount (e.g. paid_amount) alongside revenue on the same nightly basis.
 */
export function inRangeNightFraction(
  order: RevenueOrder,
  rangeStart?: Date,
  rangeEnd?: Date,
): number {
  if (!isRevenueOrder(order)) return 0;
  const nights = orderNights(order);
  if (nights === 0) return 0;
  const start = parseDay(order.check_in_date as string);
  const rs = rangeStart ? toDay(rangeStart) : undefined;
  const re = rangeEnd ? toDay(rangeEnd) : undefined;
  let inRange = 0;
  for (let i = 0; i < nights; i++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (rs && day < rs) continue;
    if (re && day > re) continue;
    inRange++;
  }
  return inRange / nights;
}

/** Total accrued revenue for a list of orders within an optional window. */
export function totalAccruedRevenue(
  orders: RevenueOrder[],
  rangeStart?: Date,
  rangeEnd?: Date,
): number {
  let sum = 0;
  for (const o of orders) {
    for (const s of accrueOrderNightlyShares(o, rangeStart, rangeEnd)) sum += s.amount;
  }
  return sum;
}

/**
 * Accrue an arbitrary per-order amount (e.g. paid_amount) on the same
 * nightly basis as revenue. Returns 0 for excluded orders so callers stay
 * consistent with `totalAccruedRevenue`.
 */
export function accrueOrderAmount(
  order: RevenueOrder,
  amount: number | null | undefined,
  rangeStart?: Date,
  rangeEnd?: Date,
): number {
  const f = inRangeNightFraction(order, rangeStart, rangeEnd);
  if (f === 0) return 0;
  return (Number(amount) || 0) * f;
}
