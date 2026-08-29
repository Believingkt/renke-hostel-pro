/**
 * Reception 備品顯示 / 當日準備總表（純函式）
 *
 * 資料來源唯一 SoT：order_amenity_allocations + amenity_items
 * 不解析、也不寫入 orders.notes。
 *
 * 語意隔離：
 * - Amenity Inventory（get_amenity_daily_usage）＝住宿夜 peak 佔用，用於可分配數量
 * - Reception Daily Preparation（本檔）＝當日名單各訂單 allocation.quantity 的 SUM
 */

export interface ReceptionAmenityItemRef {
  id: string;
  name: string;
  unit: string | null;
  display_order?: number | null;
}

export interface ReceptionAmenityLine {
  itemId: string;
  name: string;
  unit: string | null;
  quantity: number;
  displayOrder: number;
}

export type ReceptionAmenityMap = Record<string, ReceptionAmenityLine[]>;

/** 「嬰兒床 ×1 張」；unit 為空時 fallback 為「嬰兒床 ×1」 */
export function formatAmenityLine(line: ReceptionAmenityLine): string {
  const unit = (line.unit ?? "").trim();
  return `${line.name} ×${line.quantity}${unit ? ` ${unit}` : ""}`;
}

function sortLines(lines: ReceptionAmenityLine[]): ReceptionAmenityLine[] {
  return [...lines].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, "zh-Hant"),
  );
}

/** 由 allocation rows + item 定義建立 orderId → lines map */
export function buildOrderAmenityMap(
  allocations: Array<{ order_id: string; amenity_item_id: string; quantity: number | null }>,
  items: ReceptionAmenityItemRef[],
): ReceptionAmenityMap {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const map: ReceptionAmenityMap = {};
  allocations.forEach((row) => {
    const qty = Number(row.quantity) || 0;
    if (qty <= 0) return;
    const item = itemById.get(row.amenity_item_id);
    if (!item) return;
    const list = map[row.order_id] ?? (map[row.order_id] = []);
    list.push({
      itemId: item.id,
      name: item.name,
      unit: item.unit ?? null,
      quantity: qty,
      displayOrder: item.display_order ?? 0,
    });
  });
  Object.keys(map).forEach((k) => {
    map[k] = sortLines(map[k]);
  });
  return map;
}

/**
 * 當日備品準備總表：只加總傳入的訂單集合（Reception 當前名單，已排除 cancelled）
 * 不使用 peak availability。
 */
export function aggregateAmenitySummary(
  orderIds: string[],
  map: ReceptionAmenityMap,
): ReceptionAmenityLine[] {
  const acc = new Map<string, ReceptionAmenityLine>();
  orderIds.forEach((id) => {
    (map[id] ?? []).forEach((line) => {
      const prev = acc.get(line.itemId);
      if (prev) prev.quantity += line.quantity;
      else acc.set(line.itemId, { ...line });
    });
  });
  return sortLines([...acc.values()]).filter((l) => l.quantity > 0);
}

/**
 * 總表 aggregate 專用訂單集合（與單筆顯示語意分離）
 * - checkin：只取 check_in_date === activeDate（新入住，排除續住）
 * - checkout：只取 check_out_date === activeDate
 */
export function selectSummaryOrderIds(
  orders: Array<{ id: string; check_in_date: string; check_out_date: string }>,
  activeDate: string,
  mode: "checkin" | "checkout",
): string[] {
  return orders
    .filter((o) =>
      mode === "checkout" ? o.check_out_date === activeDate : o.check_in_date === activeDate,
    )
    .map((o) => o.id);
}
