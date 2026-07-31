/**
 * 加購項目金額加總（與前端 src/lib/ownerSettlement.ts 的 extractAddonTotal 邏輯一致）
 * 逐筆加總 orders.custom_addon_details JSONB 陣列裡的 total 欄位。
 */
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

/**
 * 佣金/獎金計算基礎：final_price 扣除加購項目（不小於 0）。
 */
export function commissionBaseFromOrder(order: {
  final_price?: number | string | null;
  custom_addon_details?: unknown;
}): number {
  const final = Number(order.final_price ?? 0) || 0;
  const addon = extractAddonTotal(order.custom_addon_details);
  return Math.max(0, final - addon);
}
