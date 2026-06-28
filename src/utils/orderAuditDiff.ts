// 訂單變更紀錄欄位對照與差異計算
export interface OrderFieldChange {
  field: string;
  label: string;
  before: any;
  after: any;
}

const FIELD_LABELS: Record<string, string> = {
  guest_name: "姓名",
  guest_phone: "電話",
  guest_email: "Email",
  guest_address: "地址",
  guest_gender: "性別",
  guest_nationality: "國籍",
  guest_count: "人數",
  order_source: "訂單來源",
  owner_direct: "業主直訂",
  lock_whole_building: "包棟鎖定",
  order_status: "訂單狀態",
  payment_status: "付款狀態",
  deposit_payment_method: "訂金付款方式",
  balance_payment_method: "尾款付款方式",
  meal_plan: "餐食方案",
  // notes: 由 computeVisibleNotesDiff 另行處理，避免結構性區塊噪音
  room_type_id: "房型",
  discount_code: "折扣碼",
  paid_amount: "已付金額",
  pet_count: "寵物數量",
  pet_plan_price: "寵物加購金額",
  meal_plan_total: "餐食總額",
  meal_plan_details: "餐食明細",
  custom_addon_details: "加購明細",
  total_price: "房費",
  discount_amount: "折扣金額",
  deposit_amount: "訂金",
  final_price: "實收",
  check_in_date: "入住日期",
  check_out_date: "退房日期",
  checked_in_at: "入住時間",
  checked_out_at: "退房時間",
  cancelled_at: "取消時間",
  confirmed_at: "確認時間",
  addon_total: "加購總額",
  extra_addon_amount: "額外現場加購金額",
  addon_note: "額外現場加購備註",
  __rooms: "房間配置",
  __exclusive_config: "包區/包棟房型配置",
  __notes_visible: "備註",
};

const money = (value: any): string => {
  const n = Number(value || 0);
  return `NT$ ${Number.isFinite(n) ? n.toLocaleString() : 0}`;
};

const formatDateText = (value: any): string => {
  if (!value) return "未指定日期";
  return String(value).slice(0, 10).replace(/-/g, "/");
};

const normalizeMealPlanDetails = (value: any): Array<{ date: string; count: number; pricePerUnit: number; price: number }> | null => {
  if (!Array.isArray(value)) return null;
  const rows = value
    .filter((d) => d && typeof d === "object")
    .map((d) => {
      const count = Number(d.count || 0);
      const price = Number(d.price || 0);
      const pricePerUnit = Number(d.pricePerUnit ?? d.price_per_unit ?? (count > 0 ? price / count : 0));
      return {
        date: String(d.date || ""),
        count,
        pricePerUnit,
        price,
      };
    })
    .filter((d) => d.date || d.count > 0 || d.price > 0 || d.pricePerUnit > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  return rows.length > 0 ? rows : null;
};

const normalizeCustomAddonDetails = (value: any): Array<{ addon_type: string; count: number; price_per_unit: number; total: number; unit_label: string }> | null => {
  if (!Array.isArray(value)) return null;
  const reservedTypes = new Set(["pet", "寵物", "meal", "餐食", "bbq", "烤肉"]);
  const rows = value
    .filter((d) => d && typeof d === "object")
    .filter((d) => !reservedTypes.has(String(d.addon_type || "")))
    .map((d) => ({
      addon_type: String(d.addon_type || "未命名加購"),
      count: Number(d.count || 0),
      price_per_unit: Number(d.price_per_unit ?? d.pricePerUnit ?? 0),
      total: Number(d.total || 0),
      unit_label: String(d.unit_label || "份"),
    }))
    .filter((d) => d.addon_type || d.count > 0 || d.total > 0 || d.price_per_unit > 0)
    .sort((a, b) => a.addon_type.localeCompare(b.addon_type));
  return rows.length > 0 ? rows : null;
};

const normalizeForCompare = (field: string, value: any): any => {
  if (field === "meal_plan_details") return normalizeMealPlanDetails(value);
  if (field === "custom_addon_details") return normalizeCustomAddonDetails(value);
  return value;
};

// 將 notes 內結構性區塊（加購備註/加購金額/包區房間配置/🔒鎖定稽核行）剝除，
// 只保留使用者可見的純文字 備註
export function extractVisibleNotes(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/【(?:加購備註|額外現場加購備註)[^】]*】\n?[\s\S]*?\n?【(?:加購備註|額外現場加購備註)END】\n?/g, "")
    .replace(/【額外現場加購金額[^】]*】\n?[\s\S]*?\n?【額外現場加購金額END】\n?/g, "")
    .split("\n")
    .filter((line) => !/^【\s*(?:包區|包棟)\s*房間配置\s*】/.test(line.trim()))
    .filter((line) => !/^【(?:加購備註|額外現場加購備註)[^】]*】/.test(line.trim()))
    .filter((line) => !/^🔒\[金額異動 /.test(line.trim()))
    .join("\n")
    .trim();
}

export function computeVisibleNotesDiff(
  beforeRaw: string | null | undefined,
  afterRaw: string | null | undefined,
): OrderFieldChange | null {
  const a = extractVisibleNotes(beforeRaw);
  const b = extractVisibleNotes(afterRaw);
  if (a === b) return null;
  return { field: "__notes_visible", label: FIELD_LABELS.__notes_visible, before: a || "(空)", after: b || "(空)" };
}

export function extractAddonNote(raw: string | null | undefined): string {
  if (!raw) return "";
  const blocks = [...raw.matchAll(/【(?:加購備註|額外現場加購備註)[^】]*】\n?([\s\S]*?)\n?【(?:加購備註|額外現場加購備註)END】/g)];
  if (blocks.length > 0) return blocks[blocks.length - 1][1].trim();
  const m = raw.match(/^【(?:加購備註|額外現場加購備註)[^】]*】(.*)$/m);
  return m ? m[1].trim() : "";
}

export function extractExtraAddonAmount(raw: string | null | undefined): number {
  if (!raw) return 0;
  const blocks = [...raw.matchAll(/【額外現場加購金額[^】]*】\n?(\d+)\n?【額外現場加購金額END】/g)];
  if (blocks.length === 0) return 0;
  return parseInt(blocks[blocks.length - 1][1], 10) || 0;
}

const norm = (v: any): any => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "string") return v.trim();
  return v;
};

const deepEqual = (a: any, b: any, field = ""): boolean => {
  const na = norm(normalizeForCompare(field, a));
  const nb = norm(normalizeForCompare(field, b));
  if (na === nb) return true;
  if (na === null || nb === null) return false;
  if (typeof na !== typeof nb) return false;
  if (typeof na === "object") {
    try {
      return JSON.stringify(na) === JSON.stringify(nb);
    } catch {
      return false;
    }
  }
  return false;
};

export function computeOrderDiff(
  before: Record<string, any>,
  after: Record<string, any>,
): OrderFieldChange[] {
  const changes: OrderFieldChange[] = [];
  const keys = Object.keys(after);
  for (const k of keys) {
    if (!(k in FIELD_LABELS)) continue;
    const a = after[k];
    const b = before?.[k];
    if (!deepEqual(b, a, k)) {
      changes.push({ field: k, label: FIELD_LABELS[k], before: b ?? null, after: a ?? null });
    }
  }
  return changes;
}

export function formatChangeValue(field: string, value: any): string {
  if (field === "meal_plan_details") {
    const rows = normalizeMealPlanDetails(value);
    if (!rows) return "(空)";
    return rows
      .map((d) => `${formatDateText(d.date)}：${d.count} 份 × ${money(d.pricePerUnit)} = ${money(d.price)}`)
      .join("\n");
  }
  if (field === "custom_addon_details") {
    const rows = normalizeCustomAddonDetails(value);
    if (!rows) return "(空)";
    return rows
      .map((d) => `${d.addon_type}：${d.count}${d.unit_label || "份"} × ${money(d.price_per_unit)} = ${money(d.total)}`)
      .join("\n");
  }
  if (value === null || value === undefined || value === "") return "(空)";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return value.length === 0 ? "(空)" : JSON.stringify(value, null, 2);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    try {
      return new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
    } catch {
      return value;
    }
  }
  return String(value);
}

export function getFieldLabel(field: string): string {
  return FIELD_LABELS[field] || field;
}

// 將 order_rooms 陣列序列化為人類可讀字串
interface RoomLike {
  room_type_id: string;
  quantity: number;
  room_price?: number | null;
  room_unit_id?: string | null;
}
function formatRoomsList(
  rooms: RoomLike[],
  roomTypeNameMap: Record<string, string>,
  unitNameMap: Record<string, string>,
): string {
  if (!rooms || rooms.length === 0) return "(無)";
  return rooms
    .map((r) => {
      const typeName = roomTypeNameMap[r.room_type_id] || r.room_type_id?.slice(0, 6) || "未知房型";
      const unit = r.room_unit_id ? `[${unitNameMap[r.room_unit_id] || "指定單位"}]` : r.quantity === 1 ? "[自動安排]" : "";
      const price = r.room_price != null ? ` $${r.room_price}` : "";
      return `${typeName}×${r.quantity}${unit}${price}`;
    })
    .join("、");
}

export function computeRoomsDiff(
  before: RoomLike[],
  after: RoomLike[],
  roomTypeNameMap: Record<string, string> = {},
  unitNameMap: Record<string, string> = {},
): OrderFieldChange | null {
  const a = formatRoomsList(before || [], roomTypeNameMap, unitNameMap);
  const b = formatRoomsList(after || [], roomTypeNameMap, unitNameMap);
  if (a === b) return null;
  return { field: "__rooms", label: FIELD_LABELS.__rooms, before: a, after: b };
}

export function computeExclusiveConfigDiff(
  before: Array<Record<string, number>> | null | undefined,
  after: Array<Record<string, number>> | null | undefined,
): OrderFieldChange | null {
  const ser = (arr: Array<Record<string, number>> | null | undefined) => {
    if (!arr || arr.length === 0) return "(無)";
    return arr
      .map((cfg, i) => {
        const parts = Object.entries(cfg)
          .filter(([, n]) => Number(n) > 0)
          .map(([k, n]) => `${k} ${n} 間`);
        return parts.length > 0 ? `#${i + 1} ${parts.join("、")}` : `#${i + 1} (空)`;
      })
      .join("｜");
  };
  const a = ser(before);
  const b = ser(after);
  if (a === b) return null;
  return { field: "__exclusive_config", label: FIELD_LABELS.__exclusive_config, before: a, after: b };
}
