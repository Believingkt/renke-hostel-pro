/**
 * 「台灣旅圖」訂房連結（參數化佔位）。
 * 旅圖 API 尚未確認，先以可設定的常數 + query 參數組連結，
 * 日後接上真 API 只需替換 buildLvtuBookingUrl 的實作。
 */

/** 連結樣板：{hotelCode} / {date} 會被取代 */
export const LVTU_BOOKING_URL_TEMPLATE =
  "https://lvtu.example/booking?hotel={hotelCode}&date={checkinDate}";

/** 館別 → 旅圖 hotelCode 對照（暫以館別 UUID 對應，之後改由 system settings 提供） */
export const LVTU_HOTEL_CODES: Record<string, string> = {
  "5f764d55-ae11-4631-80fe-2e611853deae": "SENSAN",
  "6b6ac0dc-602b-4dec-9167-7791ac412ba3": "HAKUNA",
  "74d064f4-1f8c-47e8-9be0-f0a596bbe6f8": "OLIVIA",
  "8e3e8866-3cb0-4654-91f3-d9b09a543301": "SONGSIANG",
};

export const LVTU_DEFAULT_HOTEL_CODE = "LAKEZE";

export function lvtuHotelCode(accommodationId?: string | null): string {
  if (!accommodationId) return LVTU_DEFAULT_HOTEL_CODE;
  return LVTU_HOTEL_CODES[accommodationId] || LVTU_DEFAULT_HOTEL_CODE;
}

export function buildLvtuBookingUrl(
  accommodationId: string | null | undefined,
  checkinDate: string,
): string {
  return LVTU_BOOKING_URL_TEMPLATE.replace("{hotelCode}", lvtuHotelCode(accommodationId)).replace(
    "{checkinDate}",
    checkinDate,
  );
}
