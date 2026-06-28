// 庫存變更來源類型，寫入 room_inventory_pricing.last_change_source
// 由觸發器自動轉錄到 room_inventory_audit_log.change_source
export type InventoryChangeSource =
  | "manual_edit"        // 手動編輯（RoomPriceEditDialog、單格編輯）
  | "inline_edit"        // 行內編輯（RoomInventoryCalendar 滑桿/輸入）
  | "bulk_open"          // 一鍵開啟庫存（BulkOpenInventoryDialog）
  | "bulk_close"         // 一鍵關閉庫存（BulkOpenInventoryDialog）
  | "one_click_sync"     // 一鍵套用後同步可售數
  | "template_apply"     // 模板/專案套用
  | "template_clear"     // 模板清除
  | "project_clear"      // 專案清除
  | "inventory_mgmt";    // 通用庫存管理元件

export const CHANGE_SOURCE_LABEL: Record<string, { text: string; cls: string }> = {
  manual_edit:    { text: "手動編輯",     cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  inline_edit:    { text: "行內編輯",     cls: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  bulk_open:      { text: "一鍵開啟",     cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  one_click_sync: { text: "一鍵同步",     cls: "bg-teal-500/15 text-teal-700 dark:text-teal-400" },
  template_apply: { text: "模板套用",     cls: "bg-purple-500/15 text-purple-700 dark:text-purple-400" },
  template_clear: { text: "模板清除",     cls: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
  project_clear:  { text: "專案清除",     cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
  inventory_mgmt: { text: "庫存管理",     cls: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400" },
};

export function getChangeSourceBadge(source: string | null | undefined) {
  if (!source) return { text: "未指定", cls: "bg-muted text-muted-foreground" };
  return CHANGE_SOURCE_LABEL[source] || { text: source, cls: "bg-muted text-muted-foreground" };
}
