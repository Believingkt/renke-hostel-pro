// 訂單建立限流：防止有人短時間內大量灌單（含冒用他人 Email）。
// 規則（僅計算「未付款」訂單，後台/手動/OTA 匯入不受限）：
//   Email：10 分鐘 3 筆 / 24 小時 10 筆
//   IP  ：10 分鐘 5 筆 / 24 小時 20 筆
// 嘗試紀錄寫入 public.order_create_attempts，保留 7 天。

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Admin = ReturnType<typeof createClient>;

export const ORDER_RATE_LIMITS = {
  emailShort: { windowMinutes: 10, max: 3 },
  emailLong: { windowMinutes: 60 * 24, max: 10 },
  ipShort: { windowMinutes: 10, max: 5 },
  ipLong: { windowMinutes: 60 * 24, max: 20 },
};

// 這些狀態代表「尚未付款」，才納入限流計算
const UNPAID_STATUSES = ["unpaid", "pending_payment", "pending"];
// 後台/手動/匯入來源不受限
const EXEMPT_SOURCES = ["manual", "admin", "owlting", "hotelnabe", "ota", "import"];

export function getClientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    null
  );
}

function sinceIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export interface RateLimitResult {
  limited: boolean;
  reason?: string;
  message?: string;
  retryAfterMinutes?: number;
}

/**
 * 檢查是否超出下單限流。任何內部錯誤都回傳「不限流」，避免擋到正常客人。
 */
export async function checkOrderRateLimit(
  admin: Admin,
  params: { email?: string | null; ip?: string | null },
): Promise<RateLimitResult> {
  const email = params.email?.trim().toLowerCase() || null;
  const ip = params.ip || null;

  try {
    // --- Email：以實際「未付款訂單」計數（已付款的正常客人不受影響） ---
    if (email) {
      for (const [key, cfg] of [
        ["emailShort", ORDER_RATE_LIMITS.emailShort],
        ["emailLong", ORDER_RATE_LIMITS.emailLong],
      ] as const) {
        const { count, error } = await admin
          .from("orders")
          .select("id", { count: "exact", head: true })
          .ilike("guest_email", email)
          .in("payment_status", UNPAID_STATUSES)
          .not("order_source", "in", `(${EXEMPT_SOURCES.join(",")})`)
          .gte("created_at", sinceIso(cfg.windowMinutes));

        if (!error && (count ?? 0) >= cfg.max) {
          return {
            limited: true,
            reason: key,
            retryAfterMinutes: cfg.windowMinutes,
            message:
              "您目前有多筆尚未完成付款的訂單，請先完成付款或稍後再試。如需協助請與我們聯繫。",
          };
        }
      }
    }

    // --- IP：以嘗試紀錄計數 ---
    if (ip) {
      for (const [key, cfg] of [
        ["ipShort", ORDER_RATE_LIMITS.ipShort],
        ["ipLong", ORDER_RATE_LIMITS.ipLong],
      ] as const) {
        const { count, error } = await admin
          .from("order_create_attempts")
          .select("id", { count: "exact", head: true })
          .eq("ip", ip)
          .gte("created_at", sinceIso(cfg.windowMinutes));

        if (!error && (count ?? 0) >= cfg.max) {
          return {
            limited: true,
            reason: key,
            retryAfterMinutes: cfg.windowMinutes,
            message: "系統偵測到短時間內大量訂房嘗試，請稍後再試。如需協助請與我們聯繫。",
          };
        }
      }
    }
  } catch (e) {
    console.error("[orderRateLimit] check failed (fail-open):", e);
  }

  return { limited: false };
}

/** 記錄一次下單嘗試，並順手清掉 7 天前的舊紀錄。 */
export async function recordOrderAttempt(
  admin: Admin,
  params: {
    email?: string | null;
    ip?: string | null;
    accommodationId?: string | null;
    orderNumber?: string | null;
  },
): Promise<void> {
  try {
    await admin.from("order_create_attempts").insert({
      email: params.email?.trim().toLowerCase() || null,
      ip: params.ip || null,
      accommodation_id: params.accommodationId || null,
      order_number: params.orderNumber || null,
    });

    // 約 5% 機率順帶清理，避免每次都下 DELETE
    if (Math.random() < 0.05) {
      await admin
        .from("order_create_attempts")
        .delete()
        .lt("created_at", sinceIso(60 * 24 * 7));
    }
  } catch (e) {
    console.error("[orderRateLimit] record failed (non-blocking):", e);
  }
}
