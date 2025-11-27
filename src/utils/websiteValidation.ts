import { z } from "zod";

// 通用的 URL 驗證
const urlSchema = z.string().trim().refine(
  (val) => {
    if (!val) return true; // 允許空值
    try {
      new URL(val);
      return true;
    } catch {
      return false;
    }
  },
  { message: "請輸入有效的網址（需包含 http:// 或 https://）" }
);

// 電話號碼驗證（台灣格式）
const phoneSchema = z.string().trim().refine(
  (val) => {
    if (!val) return true; // 允許空值
    // 支援台灣手機號碼和市話格式
    const phoneRegex = /^(\+?886-?)?0?[2-9]\d{7,9}$/;
    return phoneRegex.test(val.replace(/[\s-]/g, ''));
  },
  { message: "請輸入有效的電話號碼（例：0912-345-678 或 02-2345-6789）" }
);

// Email 驗證
const emailSchema = z.string().trim().email({ message: "請輸入有效的電子郵件地址" }).or(z.literal(""));

// 網頁資訊驗證
export const headerFooterSchema = z.object({
  browserTitle: z.string().trim()
    .min(1, { message: "瀏覽器標題不能為空" })
    .max(70, { message: "瀏覽器標題不能超過 70 字元" }),
  address: z.string().trim().max(200, { message: "地址不能超過 200 字元" }).optional(),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  lineId: z.string().trim().max(50, { message: "LINE ID 不能超過 50 字元" }).optional(),
  facebookUrl: urlSchema.optional(),
  instagramUrl: urlSchema.optional(),
  threadsUrl: urlSchema.optional(),
  youtubeUrl: urlSchema.optional(),
  tiktokUrl: urlSchema.optional(),
});

// 社群分享驗證
export const socialSharingSchema = z.object({
  ogTitle: z.string().trim()
    .min(1, { message: "標題不能為空" })
    .max(60, { message: "標題不能超過 60 字元" }),
  ogDescription: z.string().trim()
    .min(1, { message: "描述不能為空" })
    .max(160, { message: "描述不能超過 160 字元" }),
});

// 特色說明驗證
export const aboutSectionSchema = z.object({
  sectionTitle: z.string().trim()
    .min(1, { message: "標題不能為空" })
    .max(50, { message: "標題不能超過 50 字元" }),
  sectionDescription: z.string().trim()
    .max(300, { message: "描述不能超過 300 字元" })
    .optional(),
});

// 特色區塊驗證
export const featureSchema = z.object({
  title: z.string().trim()
    .min(1, { message: "標題不能為空" })
    .max(30, { message: "標題不能超過 30 字元" }),
  description: z.string().trim()
    .min(1, { message: "描述不能為空" })
    .max(200, { message: "描述不能超過 200 字元" }),
  iconName: z.string().trim()
    .min(1, { message: "請選擇圖示" }),
});

// 首頁輪播驗證
export const heroSchema = z.object({
  heroMainTitle: z.string().trim()
    .max(50, { message: "主標題不能超過 50 字元" })
    .optional(),
  heroSubtitle: z.string().trim()
    .max(100, { message: "副標題不能超過 100 字元" })
    .optional(),
  heroDescription: z.string().trim()
    .max(200, { message: "描述不能超過 200 字元" })
    .optional(),
  heroOverlayOpacity: z.number()
    .min(0, { message: "透明度不能小於 0" })
    .max(100, { message: "透明度不能大於 100" }),
  heroAutoplayDelay: z.number()
    .min(3, { message: "自動播放間隔不能小於 3 秒" })
    .max(20, { message: "自動播放間隔不能大於 20 秒" }),
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
