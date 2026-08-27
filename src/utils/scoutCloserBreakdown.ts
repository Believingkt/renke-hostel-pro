/**
 * 星探成交獎金（合作折扣碼成交加成）明細彙整。
 *
 * 純函式：只做顯示彙整與金額加總，不影響任何後端計算口徑。
 * 「星探成交獎金」為獨立卡片，不得併入成交獎金（closer）卡片金額或其各館別明細合計。
 */

export interface ScoutCloserOrderInput {
  id: string;
  order_number?: string | null;
  discount_code?: string | null;
  final_price?: number | string | null;
}

export interface ScoutCloserCodeRow {
  code: string;
  rate: number;
  count: number;
  amount: number;
  orders: Array<{ no: string; amount: number; settled: boolean }>;
}

export interface ScoutCloserBreakdown {
  rows: ScoutCloserCodeRow[];
  total: number;
  orderCount: number;
}

export function normalizeDiscountCode(code: string | null | undefined): string {
  return String(code ?? "").trim().toUpperCase();
}

/**
 * @param orders     期別內、未取消的訂單
 * @param rateMap    折扣碼（已正規化大寫）→ 成交加成費率
 * @param eligible   訂單是否採計（成交人為本人且未被排除）
 * @param settledIds 已寫入 scout_discount_code_payouts 的 order id（＝實發，其餘為預估）
 */
export function buildScoutCloserBreakdown(
  orders: ScoutCloserOrderInput[],
  rateMap: Map<string, number>,
  eligible: (orderId: string) => boolean,
  settledIds: Set<string> = new Set(),
): ScoutCloserBreakdown {
  const byCode = new Map<string, ScoutCloserCodeRow>();
  let total = 0;
  let orderCount = 0;

  for (const o of orders) {
    if (!eligible(o.id)) continue;
    const code = normalizeDiscountCode(o.discount_code);
    const rate = rateMap.get(code);
    if (!code || !rate || rate <= 0) continue;

    const amount = Math.round(Number(o.final_price ?? 0) * rate);
    total += amount;
    orderCount += 1;

    let row = byCode.get(code);
    if (!row) {
      row = { code, rate, count: 0, amount: 0, orders: [] };
      byCode.set(code, row);
    }
    row.count += 1;
    row.amount += amount;
    row.orders.push({
      no: String(o.order_number ?? o.id),
      amount,
      settled: settledIds.has(String(o.id)),
    });
  }

  return {
    rows: Array.from(byCode.values()).sort((a, b) => b.amount - a.amount),
    total,
    orderCount,
  };
}
