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
  notes: "備註",
  room_type_id: "房型",
  discount_code: "折扣碼",
  paid_amount: "已付金額",
  pet_count: "寵物數量",
  pet_plan_price: "寵物加購金額",
  meal_plan_total: "餐食總額",
  meal_plan_details: "餐食明細",
  custom_addon_details: "自訂加購",
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
};

const norm = (v: any): any => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "string") return v.trim();
  return v;
};

const deepEqual = (a: any, b: any): boolean => {
  const na = norm(a);
  const nb = norm(b);
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
    if (!deepEqual(b, a)) {
      changes.push({ field: k, label: FIELD_LABELS[k], before: b ?? null, after: a ?? null });
    }
  }
  return changes;
}

export function formatChangeValue(field: string, value: any): string {
  if (value === null || value === undefined || value === "") return "(空)";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return value.length === 0 ? "(空)" : `${value.length} 筆`;
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
