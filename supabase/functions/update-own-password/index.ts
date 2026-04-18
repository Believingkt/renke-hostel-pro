import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { isLeakedPassword } from "../_shared/hibp.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Rate limiting: 10 attempts per user per 15 minutes
const userAttemptMap = new Map<string, { count: number; resetAt: number }>();
const USER_RATE_LIMIT_MAX = 10;
const USER_RATE_LIMIT_WINDOW = 15 * 60 * 1000;

function checkUserRateLimit(userId: string): { allowed: boolean } {
  const now = Date.now();
  const existing = userAttemptMap.get(userId);

  if (!existing || now > existing.resetAt) {
    userAttemptMap.set(userId, { count: 1, resetAt: now + USER_RATE_LIMIT_WINDOW });
    return { allowed: true };
  }

  if (existing.count >= USER_RATE_LIMIT_MAX) {
    return { allowed: false };
  }

  existing.count++;
  return { allowed: true };
}

// Password strength validation (server-side)
const COMMON_PASSWORDS = new Set(
  [
    "password",
    "password123",
    "123456",
    "12345678",
    "123456789",
    "qwerty",
    "qwerty123",
    "111111",
    "11111111",
    "000000",
    "00000000",
    "admin",
    "admin123",
    "letmein",
    "iloveyou",
  ].map((p) => p.toLowerCase())
);

function validatePasswordStrength(
  password: string,
  email?: string
): { valid: boolean; message: string } {
  if (password.length < 12) return { valid: false, message: "密碼長度至少需要 12 個字元" };
  if (!/[A-Z]/.test(password)) return { valid: false, message: "密碼需包含至少一個大寫字母" };
  if (!/[a-z]/.test(password)) return { valid: false, message: "密碼需包含至少一個小寫字母" };
  if (!/[0-9]/.test(password)) return { valid: false, message: "密碼需包含至少一個數字" };

  const normalized = password.trim().toLowerCase();
  if (COMMON_PASSWORDS.has(normalized)) {
    return { valid: false, message: "此密碼過於常見，請更換為更難猜的密碼" };
  }

  if (email) {
    const normalizedEmail = email.trim().toLowerCase();
    const passwordLower = password.toLowerCase();
    const [localPart, domain] = normalizedEmail.split("@");
    if (normalizedEmail && passwordLower.includes(normalizedEmail)) {
      return { valid: false, message: "密碼不可包含您的電子郵件" };
    }
    if (localPart && localPart.length >= 3 && passwordLower.includes(localPart)) {
      return { valid: false, message: "密碼不可包含您的帳號（電子郵件前綴）" };
    }
    if (domain) {
      const domainPrefix = domain.split(".")[0];
      if (domainPrefix && domainPrefix.length >= 3 && passwordLower.includes(domainPrefix)) {
        return { valid: false, message: "密碼不可包含您的電子郵件網域" };
      }
    }
  }

  return { valid: true, message: "" };
}

// NOTE: leaked-password check is shared in ../_shared/hibp.ts (adds timeout + retries)

interface UpdateOwnPasswordRequest {
  newPassword: string;
  clearForcePasswordChange?: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "未登入" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { newPassword, clearForcePasswordChange }: UpdateOwnPasswordRequest = await req.json();
    if (!newPassword) {
      return new Response(JSON.stringify({ error: "缺少必要參數" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Client with user JWT for identity
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "未登入" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const user = userData.user;

    const rate = checkUserRateLimit(user.id);
    if (!rate.allowed) {
      return new Response(JSON.stringify({ error: "嘗試次數過多，請稍後再試" }), {
        status: 429,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Strength validation
    const strength = validatePasswordStrength(newPassword, user.email ?? undefined);
    if (!strength.valid) {
      return new Response(JSON.stringify({ error: strength.message }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Leaked password protection (application-level mitigation)
    try {
      const leaked = await isLeakedPassword(newPassword);
      if (leaked) {
        return new Response(
          JSON.stringify({ error: "此密碼曾出現在已外洩的密碼清單中，請更換為其他密碼" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }
    } catch (e) {
      // Fail-open to avoid blocking password changes during temporary network issues.
      console.warn("Leaked password check failed (continuing):", e);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const shouldClear =
      clearForcePasswordChange === true ||
      (user.user_metadata?.force_password_change === true);

    const nextMetadata = shouldClear
      ? { ...(user.user_metadata ?? {}), force_password_change: false }
      : user.user_metadata ?? {};

    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password: newPassword,
      user_metadata: nextMetadata,
    });

    if (updateError) {
      console.error("Password update failed:", updateError);
      throw new Error("修改密碼失敗");
    }

    // Best-effort sync to profiles table
    await admin
      .from("profiles")
      .update({ force_password_change: false })
      .eq("id", user.id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in update-own-password:", error);
    return new Response(JSON.stringify({ error: error.message || "修改失敗" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
