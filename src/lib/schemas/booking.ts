/**
 * 訂房流程共用 Zod schemas
 * 共用來源：HeroSection 搜尋按鈕 / BookingFlow handleNextStep & handleConfirmBooking
 */
import { z } from "zod";

const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * 入住日期 + 退房日期範圍驗證
 * - 入住不可早於今天
 * - 退房必須晚於入住
 * - 至少一晚
 */
export const dateRangeSchema = z
  .object({
    checkInDate: z.date({ required_error: "請選擇入住日期", invalid_type_error: "請選擇入住日期" }),
    checkOutDate: z.date({ required_error: "請選擇退房日期", invalid_type_error: "請選擇退房日期" }),
  })
  .refine((v) => v.checkInDate >= today(), {
    path: ["checkInDate"],
    message: "入住日期不可早於今天",
  })
  .refine((v) => v.checkOutDate > v.checkInDate, {
    path: ["checkOutDate"],
    message: "退房日期必須晚於入住日期",
  });

export type DateRangeInput = z.infer<typeof dateRangeSchema>;

/**
 * 安全驗證日期區間，回傳 { ok, error } 結果。
 * 由 UI（HeroSection）使用，無需 throw。
 */
export function validateDateRange(
  checkInDate: Date | undefined | null,
  checkOutDate: Date | undefined | null,
): { ok: true } | { ok: false; error: string } {
  if (!checkInDate) return { ok: false, error: "請選擇入住日期" };
  if (!checkOutDate) return { ok: false, error: "請選擇退房日期" };
  const result = dateRangeSchema.safeParse({ checkInDate, checkOutDate });
  if (result.success) return { ok: true };
  return { ok: false, error: result.error.errors[0]?.message ?? "日期不正確" };
}
