// 折扣碼「實際折扣率」顯示用（純顯示，不參與任何金額計算）：
//   實際折扣率 = round(帳列折扣 ÷ 帳列房費 × 100)
// 例：原價 30,900／售價 17,000／折扣碼 35% → 帳列折扣 13,900 → 顯示「原價 -45%」
// 金額一律由 discountPricing.ts 的 computeDiscountedRoomCharge() 決定，此檔只做百分比換算。

export function getActualDiscountPercent(input: {
  billedRoomTotal: number;
  discountAmount: number;
}): number | null {
  const billed = Number(input.billedRoomTotal) || 0;
  const discount = Number(input.discountAmount) || 0;
  if (!(billed > 0) || !(discount > 0)) return null;
  return Math.round((discount / billed) * 100);
}
