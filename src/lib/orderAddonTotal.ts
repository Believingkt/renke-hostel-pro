/**
 * 訂單加購金額口徑（與資料庫 public.calc_order_addon_total 完全一致）。
 *
 * orders.total_price = 純房費 + 加購金額；已付款訂單的觸發器
 * prevent_immutable_order_fields_change 只比對「純房費」，
 * 因此前端所有編輯畫面都必須用同一套口徑推導房費，否則會誤觸金額鎖。
 */

export interface OrderAddonSource {
  pet_plan_price?: number | string | null;
  custom_addon_details?: unknown;
  notes?: string | null;
  total_price?: number | string | null;
  final_price?: number | string | null;
  discount_amount?: number | string | null;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

/** 備註中的「額外現場加購金額」區塊（與 DB regexp 相同） */
export function extraOnSiteAddonFromNotes(notes?: string | null): number {
  if (!notes) return 0;
  const m = notes.match(/【額外現場加購金額[^】]*】\s*(\d+)\s*【額外現場加購金額END】/);
  return m ? Number(m[1]) || 0 : 0;
}

/** 與 DB calc_order_addon_total 相同：pet 欄位優先，加上備註現場加購（meal / bbq 舊路徑已移除，全庫 0 筆） */
export function calcOrderAddonTotal(order: OrderAddonSource): number {
  const list = Array.isArray(order.custom_addon_details)
    ? (order.custom_addon_details as Record<string, unknown>[])
    : [];
  let petFromCustom = 0;
  let otherCustom = 0;
  for (const d of list) {
    if (!d || typeof d !== "object") continue;
    const type = String((d as any).addon_type ?? "");
    const total = num((d as any).total);
    if (type === "pet") petFromCustom += total;
    else otherCustom += total;
  }
  const pet = num(order.pet_plan_price) > 0 ? num(order.pet_plan_price) : petFromCustom;
  return pet + otherCustom + extraOnSiteAddonFromNotes(order.notes);
}

/** 訂單已存加購總額 */
export const savedAddonTotalOf = calcOrderAddonTotal;

/**
 * 「純房費」= total_price 扣掉加購。
 * 舊訂單若 total_price 未含加購（final ≈ total − discount 不成立時判定），則不扣。
 */
export function pureRoomFeeOf(order: OrderAddonSource): number {
  const addon = calcOrderAddonTotal(order);
  const includesAddons =
    Math.abs(num(order.final_price) - (num(order.total_price) - num(order.discount_amount))) <= 1;
  return Math.max(0, num(order.total_price) - (includesAddons ? addon : 0));
}
