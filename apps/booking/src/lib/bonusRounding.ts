/**
 * 獎金金額「單一取整點」共用工具。
 *
 * 口徑（BONUS_RULES_SPEC 定案）：
 * - 計算過程全程保留浮點，不得中途 Math.round。
 * - 只在「每位成員 × 每個獎金項的最終金額」取整一次 → roundBonus()。
 * - 卡片／頁面合計 = 已取整子項的加總 → sumBonus()，避免「明細加總 ≠ 卡片」。
 * - 需要拆分到人（成交組績效均分、在職天數比例）用 allocateRounded() 最大餘數法，
 *   確保拆分後各人整數金額總和 = 原總額取整值。
 */

/** 唯一取整點：四捨五入到元 */
export function roundBonus(n: number | null | undefined): number {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? Math.round(v) : 0;
}

/** 合計：先各自取整再加總（與明細列顯示值完全一致） */
export function sumBonus(values: Array<number | null | undefined>): number {
  return (values ?? []).reduce<number>((acc, v) => acc + roundBonus(v), 0);
}

/** 倍率後金額（活動加倍）：仍只取整一次 */
export function roundBoosted(base: number, multiplier: number | null | undefined): number {
  const m = Number(multiplier);
  return roundBonus(Number(base ?? 0) * (Number.isFinite(m) && m > 0 ? m : 1));
}

/**
 * 最大餘數法分配：把 total 依 weights 拆成整數，總和必定等於 roundBonus(total)。
 * weights 全為 0 或空陣列時，回傳等長的 0 陣列。
 */
export function allocateRounded(total: number, weights: number[]): number[] {
  const n = weights?.length ?? 0;
  if (n === 0) return [];
  const target = roundBonus(total);
  const w = weights.map((x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : 0));
  const wSum = w.reduce((a, b) => a + b, 0);
  if (wSum <= 0) return new Array(n).fill(0);

  const raw = w.map((x) => (target * x) / wSum);
  const floors = raw.map((x) => Math.floor(x));
  let remainder = target - floors.reduce((a, b) => a + b, 0);

  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const out = floors.slice();
  let k = 0;
  while (remainder > 0 && order.length > 0) {
    out[order[k % order.length].i] += 1;
    remainder -= 1;
    k += 1;
  }
  while (remainder < 0 && order.length > 0) {
    const idx = order[order.length - 1 - (k % order.length)].i;
    if (out[idx] > 0) {
      out[idx] -= 1;
      remainder += 1;
    }
    k += 1;
  }
  return out;
}

/** 均分到 n 人（總和不變）：等權重的 allocateRounded */
export function splitEvenRounded(total: number, count: number): number[] {
  if (!count || count <= 0) return [];
  return allocateRounded(total, new Array(count).fill(1));
}
