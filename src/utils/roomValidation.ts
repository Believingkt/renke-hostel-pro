import { z } from "zod";

// 房型基本資訊驗證
export const roomTypeSchema = z.object({
  name: z.string().trim()
    .min(1, { message: "房型名稱不能為空" })
    .max(50, { message: "房型名稱不能超過 50 字元" }),
  description: z.string().trim()
    .optional(),
  size_sqm: z.string().trim().refine(
    (val) => {
      if (!val) return true;
      const num = parseFloat(val);
      return !isNaN(num) && num > 0 && num <= 1000;
    },
    { message: "坪數必須介於 0-1000 之間的數字" }
  ).optional(),
  capacity: z.string().trim().refine(
    (val) => {
      const num = parseInt(val);
      return !isNaN(num) && num >= 1 && num <= 50;
    },
    { message: "容納人數必須介於 1-50 之間" }
  ),
  room_count: z.string().trim().refine(
    (val) => {
      const num = parseInt(val);
      return !isNaN(num) && num >= 1 && num <= 100;
    },
    { message: "房間數量必須介於 1-100 之間" }
  ),
  quad_room_count: z.string().trim().refine(
    (val) => {
      const num = parseInt(val);
      return !isNaN(num) && num >= 0 && num <= 10;
    },
    { message: "四人房數量必須介於 0-10 之間" }
  ).optional(),
  double_room_count: z.string().trim().refine(
    (val) => {
      const num = parseInt(val);
      return !isNaN(num) && num >= 0 && num <= 10;
    },
    { message: "雙人房數量必須介於 0-10 之間" }
  ).optional(),
});

// 訂房設定驗證
export const bookingSettingsSchema = z.object({
  check_in_time: z.string().trim()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: "請輸入有效的時間格式（例：15:00）" })
    .optional(),
  check_out_time: z.string().trim()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: "請輸入有效的時間格式（例：11:00）" })
    .optional(),
  deposit_percentage: z.string().trim().refine(
    (val) => {
      if (!val) return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 100;
    },
    { message: "訂金比例必須介於 0-100 之間" }
  ).optional(),
  cancellation_policy: z.string().trim()
    .optional(),
  pet_policy: z.string().trim()
    .optional(),
  other_notes: z.string().trim()
    .optional(),
});

// 加購項目驗證
export const addonSettingsSchema = z.object({
  description: z.string().trim()
    .min(1, { message: "簡短描述不能為空" })
    .max(100, { message: "簡短描述不能超過 100 字元" }),
  detailed_description: z.string().trim()
    .optional(),
  unit_label: z.string().trim()
    .min(1, { message: "單位標籤不能為空" })
    .max(20, { message: "單位標籤不能超過 20 字元" }),
  price_per_unit: z.string().trim().refine(
    (val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 10000;
    },
    { message: "單價必須介於 0-10,000 之間" }
  ),
  min_quantity: z.string().trim().refine(
    (val) => {
      if (!val) return true;
      const num = parseInt(val);
      return !isNaN(num) && num >= 0 && num <= 100;
    },
    { message: "最小數量必須介於 0-100 之間" }
  ).optional(),
  max_quantity: z.string().trim().refine(
    (val) => {
      const num = parseInt(val);
      return !isNaN(num) && num >= 1 && num <= 100;
    },
    { message: "最大數量必須介於 1-100 之間" }
  ),
  weekday_min_quantity: z.string().trim().refine(
    (val) => {
      if (!val) return true;
      const num = parseInt(val);
      return !isNaN(num) && num >= 0 && num <= 100;
    },
    { message: "平日最小數量必須介於 0-100 之間" }
  ).optional(),
  weekend_min_quantity: z.string().trim().refine(
    (val) => {
      if (!val) return true;
      const num = parseInt(val);
      return !isNaN(num) && num >= 0 && num <= 100;
    },
    { message: "假日最小數量必須介於 0-100 之間" }
  ).optional(),
});

// 驗證輔助函數
export const validateField = <T extends z.ZodType>(
  schema: T,
  value: z.infer<T>
): { success: boolean; error?: string } => {
  try {
    schema.parse(value);
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0]?.message };
    }
    return { success: false, error: "驗證失敗" };
  }
};

// 批量驗證
export const validateForm = <T extends z.ZodType>(
  schema: T,
  data: z.infer<T>
): { success: boolean; errors: Record<string, string> } => {
  try {
    schema.parse(data);
    return { success: true, errors: {} };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      error.errors.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0].toString()] = err.message;
        }
      });
      return { success: false, errors };
    }
    return { success: false, errors: {} };
  }
};
