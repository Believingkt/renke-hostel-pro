/**
 * 團購活動日期規則（後台表單 + 前台訂房頁共用）
 * 純函式、無 UI 依賴，方便單元測試。
 */

export interface CampaignWindow {
  sale_start?: string | null;
  sale_end?: string | null;
  stay_start_date?: string | null;
  stay_end_date?: string | null;
}

export type CampaignFieldErrors = Partial<
  Record<"sale_start" | "sale_end" | "stay_start_date" | "stay_end_date", string>
>;

const isValidIso = (v?: string | null) => !!v && !isNaN(new Date(v).getTime());
const isValidDate = (v?: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** 後台活動表單的日期驗證：結束時間不可早於開賣、可入住迄日不可早於起日 */
export function validateCampaignWindow(c: CampaignWindow): CampaignFieldErrors {
  const errors: CampaignFieldErrors = {};

  if (c.sale_start && !isValidIso(c.sale_start)) errors.sale_start = "開賣時間格式不正確";
  if (c.sale_end && !isValidIso(c.sale_end)) errors.sale_end = "結束時間格式不正確";
  if (c.stay_start_date && !isValidDate(c.stay_start_date)) errors.stay_start_date = "可入住起日格式不正確";
  if (c.stay_end_date && !isValidDate(c.stay_end_date)) errors.stay_end_date = "可入住迄日格式不正確";

  if (!errors.sale_start && !errors.sale_end && c.sale_start && c.sale_end) {
    if (new Date(c.sale_end).getTime() < new Date(c.sale_start).getTime()) {
      errors.sale_end = "結束時間不可早於開賣時間";
    }
  }

  if (!errors.stay_start_date && !errors.stay_end_date && c.stay_start_date && c.stay_end_date) {
    if (c.stay_end_date < c.stay_start_date) {
      errors.stay_end_date = "可入住迄日不可早於可入住起日";
    }
  }

  // 只設定迄日、缺起日時不阻擋（代表不限起始），但迄日不可早於開賣日期
  if (!errors.stay_end_date && c.stay_end_date && c.sale_start && isValidIso(c.sale_start)) {
    const saleStartDay = new Date(c.sale_start).toISOString().slice(0, 10);
    if (c.stay_end_date < saleStartDay) {
      errors.stay_end_date = "可入住迄日不可早於開賣日期";
    }
  }

  return errors;
}

export const hasErrors = (e: CampaignFieldErrors) => Object.keys(e).length > 0;

/** 前台訂房日期驗證（入住 / 退房需落在活動可入住區間內） */
export function validateStayRange(
  c: CampaignWindow,
  checkIn: string,
  checkOut: string,
): { checkIn?: string; checkOut?: string } {
  const errors: { checkIn?: string; checkOut?: string } = {};
  if (!checkIn) errors.checkIn = "請選擇入住日";
  if (!checkOut) errors.checkOut = "請選擇退房日";
  if (errors.checkIn || errors.checkOut) return errors;

  if (checkOut <= checkIn) errors.checkOut = "退房日必須晚於入住日";
  if (c.stay_start_date && checkIn < c.stay_start_date) {
    errors.checkIn = `本團購可入住日自 ${c.stay_start_date} 起`;
  }
  if (c.stay_end_date && checkOut > c.stay_end_date) {
    errors.checkOut = `本團購可入住日至 ${c.stay_end_date} 止`;
  }
  return errors;
}

export type SaleState = "not_started" | "on_sale" | "ended";

/** 目前販售狀態（以現在時間比對開賣 / 結束時間） */
export function saleState(c: CampaignWindow, now: Date = new Date()): SaleState {
  if (c.sale_start && isValidIso(c.sale_start) && new Date(c.sale_start).getTime() > now.getTime()) {
    return "not_started";
  }
  if (c.sale_end && isValidIso(c.sale_end) && new Date(c.sale_end).getTime() < now.getTime()) {
    return "ended";
  }
  return "on_sale";
}

export const SALE_STATE_LABEL: Record<SaleState, string> = {
  not_started: "尚未開賣",
  on_sale: "販售中",
  ended: "已結束",
};
