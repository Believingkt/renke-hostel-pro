/**
 * Staff 模組權限常數
 * - 模組清單直接由左側選單設定（src/config/adminMenu.ts）推導，新增分頁會自動同步。
 * - 未在 DEFAULT_STAFF_PERMISSIONS_OVERRIDES 指定者，一律預設「不可見」。
 * - super_admin / hotel_admin 不受此設定限制。
 */
import { deriveModuleDefs } from "@/config/adminMenu";

export type ModulePermissionLevel = "hidden" | "readonly" | "editable";

export interface ModuleDefinition {
  key: string;
  label: string;
}

export const STAFF_MODULES: ModuleDefinition[] = deriveModuleDefs();

/** 僅列出需要「非不可見」的預設值；其餘模組（含未來新增）預設 hidden */
const DEFAULT_STAFF_PERMISSIONS_OVERRIDES: Record<string, ModulePermissionLevel> = {
  orders: "editable",
  reception: "editable",
  room_price: "editable",
  customers: "editable",
  analytics: "readonly",
  discount_codes: "readonly",
  settlement: "readonly",
  addon_center: "editable",
};

export const DEFAULT_STAFF_PERMISSIONS: Record<string, ModulePermissionLevel> =
  STAFF_MODULES.reduce(
    (acc, m) => {
      acc[m.key] = DEFAULT_STAFF_PERMISSIONS_OVERRIDES[m.key] ?? "hidden";
      return acc;
    },
    { ...DEFAULT_STAFF_PERMISSIONS_OVERRIDES } as Record<string, ModulePermissionLevel>,
  );


export const PERMISSION_LEVEL_LABEL: Record<ModulePermissionLevel, string> = {
  hidden: "不可見",
  readonly: "唯讀",
  editable: "可編輯",
};
