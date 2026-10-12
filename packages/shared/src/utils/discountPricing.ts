// 折扣碼計價（單一真理）：房費一律取較便宜者
//   毛折扣 raw      = percentage ? round(原價總額 × 折數) : min(金額, 原價總額)
//   實際房費 charged = min(售價總額, 原價總額 − 毛折扣)
//   帳列房費 billed  = max(售價總額, 原價總額)   ← 寫入 total_price 的房費部分（維持現行行為）
//   帳列折扣 discount= 帳列房費 − 實際房費        ← 寫入 discount_amount
// 加購不打折，由呼叫端自行加總。
// 此檔與 supabase/functions/_shared/discountPricing.ts 必須完全一致（同一組測試向量驗證）。

export type DiscountKind = "percentage" | "fixed";

export interface DiscountChargeResult {
  /** 帳列房費（total_price 的房費部分） */
  billedRoomTotal: number;
  /** 帳列折扣（discount_amount） */
  discountAmount: number;
  /** 實際房費（final_price 的房費部分） */
  chargedRoomTotal: number;
}

export function computeDiscountedRoomCharge(opts: {
  saleTotal: number;
  originalTotal: number;
  discountKind?: DiscountKind | null;
  discountValue?: number | null;
}): DiscountChargeResult {
  const sale = Math.max(0, Number(opts.saleTotal) || 0);
  const originalRaw = Number(opts.originalTotal) || 0;
  // 原價未設定（0 / 負數）→ 退回售價，行為與無原價的現行邏輯相同
  const original = originalRaw > 0 ? originalRaw : sale;
  const billed = Math.max(sale, original);

  if (!opts.discountKind || !(Number(opts.discountValue) > 0)) {
    return { billedRoomTotal: sale, discountAmount: 0, chargedRoomTotal: sale };
  }

  const value = Number(opts.discountValue);
  const raw = opts.discountKind === "percentage"
    ? Math.min(Math.round(original * (value / 100)), original)
    : Math.min(value, original);

  const discountedOriginal = Math.max(0, original - raw);
  const charged = Math.min(sale, discountedOriginal);
  return {
    billedRoomTotal: billed,
    discountAmount: Math.max(0, Math.min(billed, billed - charged)),
    chargedRoomTotal: charged,
  };
}
