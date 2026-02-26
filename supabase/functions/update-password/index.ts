import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { isLeakedPassword } from "../_shared/hibp.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};


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
  if (password.length < 8) {
    return { valid: false, message: "密碼長度至少需要 8 個字元" };
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
  // corsHeaders already defined at module level
  
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

    // Leaked password protection (application-level mitigation)
    try {
      console.log("Starting HIBP check...");
      const leaked = await isLeakedPassword(newPassword);
      console.log("HIBP check result:", leaked);
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
      console.warn("Leaked password check failed (continuing):", e);
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      tokenData.user_id,
      { password: newPassword }
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

    // Update profile to remove force_password_change if exists
    await supabase
      .from("profiles")
      .update({ force_password_change: false })
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
