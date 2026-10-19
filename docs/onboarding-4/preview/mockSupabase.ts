// 測試替身：wizard_precheck 回傳固定結果，其餘查詢回空
export const PRECHECK = {
  red: [
    { key: "basic_info", label: "基本資料（名稱、地址、電話、介紹、PMS 代號）", ok: true, detail: "齊全" },
    { key: "room_types", label: "至少 1 個房型（人數、房價 > 0）", ok: true, detail: "1 個房型" },
    { key: "packages", label: "至少 1 個啟用方案，三日型價格 > 0", ok: true, detail: "1 個啟用方案" },
    { key: "templates", label: "每個方案都有綁定專案，且專案房型 = 方案主房型", ok: true, detail: "全部一致" },
    { key: "inventory", label: "每個房型在 2026-10-22～2027-04-21 有庫存且至少 1 天可訂", ok: false, detail: "沒有可訂庫存：整棟包棟" },
    { key: "flags", label: "系統設定（總部）", ok: false, detail: "系統設定尚未完成，請聯絡總部", hq_detail: "自動建立專案（auto_template_enabled）未開" },
  ],
  yellow: [], red_ok: false, window_start: "2026-10-22", window_end: "2027-04-21",
  ota_status: { owlting: false, hotelnabe: false, detail: "OwlTing：未串接；Hotelnabe：未串接" },
};
const chain: any = { select: () => chain, eq: () => chain, order: () => chain, maybeSingle: async () => ({ data: null, error: null }), then: (r: any) => r({ data: [], error: null }) };
export const supabase: any = {
  rpc: async (fn: string) => ({ data: fn === "wizard_precheck" ? PRECHECK : null, error: null }),
  from: () => chain,
  auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
};
