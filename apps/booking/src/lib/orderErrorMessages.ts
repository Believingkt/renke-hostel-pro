/**
 * 訂單建立／更新錯誤訊息中文化。
 *
 * 資料庫觸發器的商業規則錯誤（如缺少姓名、當日無空房）本身已是中文，直接顯示；
 * 其餘為系統層級（權限、連線、程式錯誤）則轉為可理解的中文提示，避免把原始英文
 * 或 Postgres 內部訊息丟給使用者。
 */

const SYSTEM_PATTERNS: Array<{ test: RegExp; message: string }> = [
  { test: /does not exist/i, message: "系統設定異常，請聯繫系統管理員（資料庫函式遺失）" },
  { test: /row-level security|violates row-level security/i, message: "權限不足，無法建立此訂單，請確認帳號權限" },
  { test: /permission denied/i, message: "權限不足，無法執行此操作" },
  { test: /duplicate key|already exists/i, message: "資料重複，此訂單可能已建立，請重新整理後確認" },
  { test: /violates foreign key/i, message: "關聯資料無效，請重新選擇房型或方案後再試" },
  { test: /null value in column/i, message: "有必填欄位未填寫，請檢查後再送出" },
  { test: /invalid input syntax/i, message: "輸入格式有誤，請檢查金額與日期欄位" },
  { test: /Failed to fetch|NetworkError|fetch failed/i, message: "網路連線異常，請稍後再試" },
  { test: /timeout|timed out/i, message: "系統回應逾時，請稍後再試" },
  { test: /JWT|not authenticated|Auth session missing/i, message: "登入狀態已失效，請重新登入後再試" },
];

/** 舊版英文訊息（若尚有殘留）對應中文 */
const LEGACY_MESSAGES: Array<{ test: RegExp; message: string }> = [
  { test: /No rooms available/i, message: "所選日期已無可售房間" },
  { test: /Room not available/i, message: "所選日期房型已關閉銷售" },
  { test: /exceeds room capacity/i, message: "入住人數超過房型上限" },
  { test: /Guest name is required/i, message: "請填寫訂購人姓名" },
  { test: /(Valid )?(phone number|Guest phone) is required/i, message: "請填寫正確的聯絡電話" },
  { test: /Check-?out date must be after/i, message: "退房日期必須晚於入住日期" },
  { test: /Check-in and check-out dates are required/i, message: "請選擇入住與退房日期" },
  { test: /Invalid room type|Invalid room_type_id/i, message: "房型無效，請重新選擇房型" },
  { test: /Invalid accommodation_id/i, message: "此民宿不存在或已停用" },
  { test: /Price cannot be negative/i, message: "訂單金額不可為負數" },
  { test: /Invalid payment_status/i, message: "付款狀態無效，請重新選擇" },
];

/** 訊息是否已是中文（含中文字元即視為可直接顯示的商業規則提示） */
const hasChinese = (text: string) => /[\u4e00-\u9fff]/.test(text);

export function translateOrderError(
  error: unknown,
  fallback = "無法建立訂單，請稍後再試",
): string {
  const raw =
    (typeof error === "string" && error) ||
    (error as { message?: string; details?: string } | null)?.message ||
    (error as { details?: string } | null)?.details ||
    "";

  if (!raw) return fallback;

  for (const { test, message } of LEGACY_MESSAGES) {
    if (test.test(raw)) return message;
  }

  // 觸發器丟出的中文商業規則訊息 → 直接顯示
  if (hasChinese(raw)) return raw;

  for (const { test, message } of SYSTEM_PATTERNS) {
    if (test.test(raw)) return message;
  }

  return fallback;
}
