export const positivePrices = (list: readonly (number | null | undefined)[]): number[] =>
  list.filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p > 0);
