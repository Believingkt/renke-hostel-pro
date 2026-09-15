import { supabase } from "@/integrations/supabase/client";
import { setOtpNextAllowedAt, markOtpSent, getOtpRemaining } from "@/lib/otpThrottle";

export type RequestOtpResult = {
  ok: boolean;
  /** 剩餘冷卻秒數（以後端 next_allowed_at 為準） */
  cooldown: number;
  message?: string;
  rateLimited?: boolean;
};

/**
 * 透過後端 Edge Function 寄送登入驗證碼。
 * 後端負責限流（同一 email／IP 短時間重複要求），並回傳 next_allowed_at 時間戳，
 * 前端據此持久化冷卻時間，重新整理頁面後仍能正確倒數。
 */
export async function requestMemberOtp(
  rawEmail: string,
  opts?: { redirectTo?: string },
): Promise<RequestOtpResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return { ok: false, cooldown: 0, message: "請先輸入 Email" };

  const local = getOtpRemaining(email);
  if (local > 0) {
    return {
      ok: false,
      cooldown: local,
      rateLimited: true,
      message: `請稍候 ${local} 秒後再重新寄送驗證碼，或直接輸入先前收到的驗證碼。`,
    };
  }

  const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/request-member-otp`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ email, redirectTo: opts?.redirectTo }),
    });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    const nextAllowedAt = typeof data?.next_allowed_at === "string" ? data.next_allowed_at : null;
    setOtpNextAllowedAt(email, nextAllowedAt);

    if (res.ok && data?.sent) {
      markOtpSent(email);
      return { ok: true, cooldown: getOtpRemaining(email) };
    }

    return {
      ok: false,
      cooldown: getOtpRemaining(email),
      rateLimited: res.status === 429,
      message:
        (typeof data?.message === "string" && data.message) ||
        (typeof data?.error === "string" && data.error !== "rate_limited" ? data.error : "") ||
        "驗證碼寄送失敗，請稍後再試。",
    };
  } catch {
    return { ok: false, cooldown: 0, message: "網路連線異常，請稍後再重新寄送驗證碼。" };
  }
}

// 保留 supabase 匯入以確保 client 初始化（session 需求）
void supabase;
