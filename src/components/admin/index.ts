/**
 * PMS 後台共用 Responsive 基礎層。
 *
 * 新增後台頁面時請直接使用這裡的元件，不要重新手刻 responsive 版型：
 *  - AdminPageShell / AdminPageState：頁面內容層外框、間距、safe-area
 *  - AdminToolbar：標題 / 篩選 / 主要 CTA / 次要操作（手機自動收 More Menu）
 *  - ResponsiveDataView：Desktop Table ↔ Mobile Card
 *  - AdminFormSection / AdminFormGrid / AdminFormField：表單版型（手機一律單欄）
 *  - AdminStickyActionBar：長表單底部操作列（safe-area + 鍵盤避讓）
 *  - ResponsiveDialog：Desktop Dialog ↔ Mobile 全螢幕 Sheet
 *  - AdminDateRangeField / Calendar variant="admin"：日期選擇唯一標準
 */
export { AdminPageShell, AdminPageState } from "./AdminPageShell";
export type { AdminPageShellProps } from "./AdminPageShell";
export { AdminToolbar } from "./AdminToolbar";
export type { AdminToolbarAction, AdminToolbarProps } from "./AdminToolbar";
export { ResponsiveDataView } from "./ResponsiveDataView";
export type {
  ResponsiveColumn,
  ResponsiveRowAction,
  MobileCardConfig,
  ResponsiveDataViewProps,
} from "./ResponsiveDataView";
export { AdminFormSection, AdminFormGrid, AdminFormField } from "./AdminFormSection";
export { AdminStickyActionBar } from "./AdminStickyActionBar";
export type { AdminStickyActionBarProps } from "./AdminStickyActionBar";
export { ResponsiveDialog } from "./ResponsiveDialog";
export type { ResponsiveDialogProps, ResponsiveDialogSize } from "./ResponsiveDialog";
export { AdminDateRangeField } from "./AdminDateRangeField";
