/**
 * 防詐騙提醒文案唯一來源（純資料，不含任何邏輯）。
 * 團購訂房與一般訂房共用，請勿在頁面內另行 hardcode 文案。
 */
export type FraudNoticeVariant = "bank_transfer" | "credit_card" | "atm" | "generic";

export const FRAUD_NOTICE_TITLE = "重要提醒｜慎防詐騙";

export const FRAUD_NOTICE_CORE_POINTS: string[] = [
  "不會要求您操作 ATM、網路銀行，或以「解除分期、取消扣款、帳戶異常」等理由變更金融設定。",
  "不會透過電話、LINE 或其他私訊要求您提供網銀密碼、信用卡安全碼、提款卡密碼或簡訊驗證碼。",
  "如收到可疑來電、訊息或付款指示，請先停止操作，並透過 Lakeze 人客多或民宿官方聯絡方式再次確認。",
];

const VARIANT_NOTES: Record<FraudNoticeVariant, string | null> = {
  bank_transfer: "請以訂單成立後系統顯示的匯款帳號為準，勿依陌生訊息提供的帳號轉帳。",
  credit_card: "信用卡資料僅於本站正式付款流程輸入，請勿透過電話、LINE 或其他私訊提供卡號、安全碼或驗證碼。",
  atm: "請以系統產生的 ATM／付款資訊為準，勿依陌生來電或私訊變更付款帳號。",
  generic: null,
};

export function getFraudNoticeVariantNote(variant?: FraudNoticeVariant | string | null): string | null {
  if (!variant) return null;
  return VARIANT_NOTES[variant as FraudNoticeVariant] ?? null;
}
