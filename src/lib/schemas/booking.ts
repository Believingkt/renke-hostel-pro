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

/**
 * BookingFlow 內部使用的日期驗證（不限制入住日，但要求至少一晚與有效日期）
 * 主要差異於 dateRangeSchema：允許今天以前的日期僅供內部測試/特殊情境，
 * 仍保持「退房 > 入住」與「至少一晚」的硬性規則。
 */
export const bookingFlowDateSchema = z
  .object({
    checkInDate: z.date({
      required_error: "請選擇入住日期",
      invalid_type_error: "入住日期格式無效",
    }),
    checkOutDate: z.date({
      required_error: "請選擇退房日期",
      invalid_type_error: "退房日期格式無效",
    }),
  })
  .refine((d) => d.checkOutDate > d.checkInDate, {
    message: "退房日期必須晚於入住日期",
    path: ["checkOutDate"],
  })
  .refine(
    (d) => !isNaN(d.checkInDate.getTime()) && !isNaN(d.checkOutDate.getTime()),
    { message: "日期格式無效", path: ["checkInDate"] },
  )
  .refine(
    (d) =>
      Math.ceil(
        (d.checkOutDate.getTime() - d.checkInDate.getTime()) /
          (1000 * 60 * 60 * 24),
      ) >= 1,
    { message: "至少需要住宿一晚", path: ["checkOutDate"] },
  );

/**
 * 訂房聯絡人資訊驗證
 */
export const guestInfoSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: "姓名至少需要2個字元" })
    .max(50, { message: "姓名不能超過50個字元" }),
  phone: z
    .string()
    .trim()
    .regex(/^09\d{8}$/, { message: "請輸入有效的手機號碼（09開頭，共10碼）" }),
  email: z
    .string()
    .trim()
    .email({ message: "請輸入有效的電子郵件地址" })
    .max(100, { message: "電子郵件不能超過100個字元" }),
  address: z
    .string()
    .trim()
    .max(200, { message: "地址不能超過200個字元" })
    .optional(),
  notes: z
    .string()
    .trim()
    .max(500, { message: "備註不能超過500個字元" })
    .optional(),
});

export type GuestInfoInput = z.infer<typeof guestInfoSchema>;
