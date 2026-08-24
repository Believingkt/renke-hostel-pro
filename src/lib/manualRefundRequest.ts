/**
 * 人工退款申請說明（ATM 虛擬帳號／銀行匯款專用）。
 *
 * 信用卡（TapPay 原卡退刷）一律不得使用本文案。
 * 安全限制：旅客一律透過客服／官方 LINE 提供帳戶資料，
 * 前台不得出現銀行帳號輸入欄位或存摺上傳功能。
 *
 * ⚠️ 內容必須與 supabase/functions/_shared/manualRefundRequest.ts 完全一致
 *    （由 src/test/manual-refund-request.test.tsx 逐項比對）。
 */

export const MANUAL_REFUND_TITLE = "人工退款說明";

export const MANUAL_REFUND_INTRO =
  "本筆訂單退款將由館方人工辦理。請您聯繫客服或官方 LINE，並提供退款帳戶資料，以利後續退款作業。";

export const MANUAL_REFUND_FIELDS_TITLE = "請準備以下資料：";

export const MANUAL_REFUND_REQUIRED_FIELDS = [
  "訂單編號",
  "訂購姓名",
  "銀行名稱",
  "銀行代碼",
  "退款帳號",
  "戶名",
  "存摺封面照片或帳戶證明",
] as const;

export const MANUAL_REFUND_OUTRO = "客服確認資料後，將依退款流程安排退款。";

export const MANUAL_REFUND_NO_CONTACT = "請聯繫客服協助辦理退款。";

export interface VenueContact {
  phone?: string | null;
  lineId?: string | null;
  websiteUrl?: string | null;
  email?: string | null;
}

/** 由館別 accommodation_info.line_id 組出官方 LINE 連結（禁止寫死網址） */
export function lineOfficialUrl(lineId?: string | null): string | null {
  const id = String(lineId ?? "").trim();
  if (!id) return null;
  if (/^https?:\/\//i.test(id)) return id;
  return `https://line.me/R/ti/p/${encodeURIComponent(id.startsWith("@") ? id : `@${id}`)}`;
}

export function hasVenueContact(c?: VenueContact | null): boolean {
  return !!(c && (c.phone || lineOfficialUrl(c.lineId) || c.websiteUrl || c.email));
}
