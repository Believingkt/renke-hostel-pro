/**
 * 團購訂單口徑（caliber）切換。
 *
 * 團購訂單一律以 order_source = "group_buy" 標記。營運分析與業主月結
 * **預設不混算**（exclude），可切換為「僅團購」或「全部合併」，並提供
 * 團購／非團購兩組結果對照。
 */

export const GROUP_BUY_SOURCE = "group_buy";

export type GroupBuyMode = "exclude" | "only" | "include";

export const GROUP_BUY_MODE_OPTIONS: { k: GroupBuyMode; label: string }[] = [
  { k: "exclude", label: "不含團購" },
  { k: "only", label: "僅團購" },
  { k: "include", label: "全部合併" },
];

export const GROUP_BUY_MODE_NOTE: Record<GroupBuyMode, string> = {
  exclude: "口徑：排除團購訂單（預設，不與一般訂房混算）",
  only: "口徑：僅計算團購訂單",
  include: "口徑：團購與一般訂房合併計算",
};

export function isGroupBuyOrder(o: { order_source?: string | null } | null | undefined): boolean {
  return (o?.order_source ?? "") === GROUP_BUY_SOURCE;
}

/** 依口徑過濾訂單集合 */
export function filterByGroupBuyMode<T extends { order_source?: string | null }>(
  orders: T[] | null | undefined,
  mode: GroupBuyMode,
): T[] {
  const list = orders ?? [];
  if (mode === "include") return [...list];
  if (mode === "only") return list.filter(isGroupBuyOrder);
  return list.filter((o) => !isGroupBuyOrder(o));
}

/** 一次取得團購／非團購兩組資料，用於對照表 */
export function splitGroupBuy<T extends { order_source?: string | null }>(
  orders: T[] | null | undefined,
): { groupBuy: T[]; regular: T[] } {
  const list = orders ?? [];
  return {
    groupBuy: list.filter(isGroupBuyOrder),
    regular: list.filter((o) => !isGroupBuyOrder(o)),
  };
}
