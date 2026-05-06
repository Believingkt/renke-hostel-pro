/**
 * Staff 模組權限常數
 * - module key 對應 admin sidebar 的主項目
 * - 預設值需與 DB 函式 get_staff_module_permission 同步
 */

export type ModulePermissionLevel = "hidden" | "readonly" | "editable";

export interface ModuleDefinition {
  key: string;
  label: string;
}

export const STAFF_MODULES: ModuleDefinition[] = [
  { key: "analytics", label: "營運分析" },
  { key: "reception", label: "櫃檯接待" },
  { key: "orders", label: "訂單資訊" },
  { key: "website_content", label: "官網內容" },
  { key: "pricing", label: "房型設施" },
  { key: "room_price", label: "房價庫存" },
  { key: "customers", label: "顧客資料" },
  { key: "discount_codes", label: "網紅導購" },
  { key: "settlement", label: "請款管理" },
  { key: "owner_settlement", label: "業主月結" },
  { key: "channel_manager", label: "通路管理" },
  { key: "accounts", label: "帳號管理" },
];

export const DEFAULT_STAFF_PERMISSIONS: Record<string, ModulePermissionLevel> = {
  orders: "editable",
  reception: "editable",
  room_price: "editable",
  customers: "editable",
  analytics: "readonly",
  discount_codes: "readonly",
  settlement: "readonly",
  owner_settlement: "hidden",
  website_content: "hidden",
  pricing: "hidden",
  channel_manager: "hidden",
  accounts: "hidden",
};

export const PERMISSION_LEVEL_LABEL: Record<ModulePermissionLevel, string> = {
  hidden: "不可見",
  readonly: "唯讀",
  editable: "可編輯",
};
