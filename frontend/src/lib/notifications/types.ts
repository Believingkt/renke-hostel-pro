/**
 * 團隊小鈴鐺通知的共用模型。
 *
 * 設計原則：鈴鐺不只有「設定缺口」，未來會陸續加入 KOL 進度、訂單、財務等事件。
 * 每個事件來源只要產生 TeamNotification[]，鈴鐺就能自動分類、篩選、標記已讀。
 */

export type Severity = "error" | "warn" | "info";

/** 通知分類（鈴鐺上方的分頁） */
export type NotificationCategory = "settings" | "kol";

export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  settings: "設定缺口",
  kol: "KOL 進度",
};

export interface TeamNotification {
  /** 全域唯一（含分類前綴），已讀狀態以此為 key */
  id: string;
  /** 事件類型，對應通知偏好的靜音開關 */
  kind: string;
  category: NotificationCategory;
  severity: Severity;
  /** 左側情境（館別 / KOL 名稱 / 全站） */
  scope: string;
  title: string;
  detail: string;
  /** 可直接前往的位置；null = 此角色沒有可跳轉頁面 */
  href: string | null;
  /** 到達後是否可編輯（false 會標示唯讀） */
  editable: boolean;
  reason: string | null;
  /** 展開後的補充說明（表格 / 權限 / 操作步驟） */
  meta?: Array<{ label: string; value: string }>;
}
