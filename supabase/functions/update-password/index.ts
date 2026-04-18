import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { isLeakedPassword } from "../_shared/hibp.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;


// Rate limiting: 5 attempts per token per 15 minutes
const tokenAttemptMap = new Map<string, { count: number; resetAt: number }>();
const TOKEN_RATE_LIMIT_MAX = 5;
const TOKEN_RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes

function checkTokenRateLimit(token: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const existing = tokenAttemptMap.get(token);
  
  if (!existing || now > existing.resetAt) {
    tokenAttemptMap.set(token, { count: 1, resetAt: now + TOKEN_RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: TOKEN_RATE_LIMIT_MAX - 1 };
  }
  
  if (existing.count >= TOKEN_RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }
  
  existing.count++;
  return { allowed: true, remaining: TOKEN_RATE_LIMIT_MAX - existing.count };
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
  if (password.length < 12) {
    return { valid: false, message: "密碼長度至少需要 12 個字元" };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: "密碼需包含至少一個大寫字母" };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, message: "密碼需包含至少一個小寫字母" };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, message: "密碼需包含至少一個數字" };
  }

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

interface UpdatePasswordRequest {
  token: string;
  newPassword: string;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token, newPassword }: UpdatePasswordRequest = await req.json();
    console.log("Processing password update");

    if (!token || !newPassword) {
      throw new Error("缺少必要參數");
    }

    // Check rate limit for this token
    const rateLimit = checkTokenRateLimit(token);
    if (!rateLimit.allowed) {
      console.log("Rate limit exceeded for token");
      return new Response(
        JSON.stringify({ error: "嘗試次數過多，請 15 分鐘後再試" }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify token with explicit column selection
    const { data: tokenData, error: tokenError } = await supabase
      .from("password_reset_tokens")
      .select("id, user_id, email, token, expires_at, used_at")
      .eq("token", token)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (tokenError || !tokenData) {
      console.error("Token verification failed:", tokenError);
      throw new Error("無效或已過期的重設連結");
    }

    console.log("Token verified for user:", tokenData.user_id);

    // Check if new password is the same as current password
    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: tokenData.email,
        password: newPassword,
      });
      if (signInData?.session && !signInError) {
        await supabase.auth.signOut();
        console.log("New password matches current password");
        return new Response(
          JSON.stringify({ error: "新密碼不可與目前密碼相同，請設定不同的密碼" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }
    } catch (e) {
      console.warn("Same-password check failed (continuing):", e);
    }

    // Validate password strength (needs email context)
    const passwordValidation = validatePasswordStrength(newPassword, tokenData.email);
    if (!passwordValidation.valid) {
      console.log("Password validation failed:", passwordValidation.message);
      return new Response(
        JSON.stringify({ error: passwordValidation.message }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }
    console.log("Password validation passed");

    // HIBP leaked password protection (fail-open on network issues)
    try {
      const leaked = await isLeakedPassword(newPassword);
      if (leaked) {
        return new Response(
          JSON.stringify({ error: "此密碼曾出現在已外洩的密碼清單中，請更換為其他密碼" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    } catch (e) {
      console.warn("Leaked password check failed (continuing):", e);
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      tokenData.user_id,
      { password: newPassword, user_metadata: { force_password_change: false } }
    );

    if (updateError) {
      console.error("Password update failed:", updateError);
      throw new Error("更新密碼失敗");
    }

    // Mark token as used
    const { error: markError } = await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("token", token);

    if (markError) {
      console.error("Failed to mark token as used:", markError);
      // Don't throw here, password was already updated
    }

    // Update profile to remove force_password_change and set last_sign_in_at
    await supabase
      .from("profiles")
      .update({ force_password_change: false, last_sign_in_at: new Date().toISOString() })
      .eq("id", tokenData.user_id);

    // Clear rate limit for this token on success
    tokenAttemptMap.delete(token);

    console.log("Password updated successfully");

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in update-password function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "更新失敗" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
