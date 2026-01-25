import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// CORS
// Note: CORS is not a security boundary. We still enforce token validation.
const allowedOrigins = [
  "https://sensan.lovable.app",
  "https://dmafqwfynatdvnaeovhz.lovableproject.com",
];

function isAllowedOrigin(origin: string) {
  if (!origin) return false;
  if (allowedOrigins.includes(origin)) return true;
  // Allow Lovable hosted environments
  try {
    const url = new URL(origin);
    return (
      url.hostname.endsWith(".lovable.app") ||
      url.hostname.endsWith(".lovableproject.com") ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = isAllowedOrigin(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

async function sha1HexUpper(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function isLeakedPassword(password: string): Promise<{ leaked: boolean; count?: number }> {
  // Have I Been Pwned Pwned Passwords API (k-anonymity). We never send the password.
  const hash = await sha1HexUpper(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: {
      // Required by HIBP ToS
      "User-Agent": "LovableCloudPasswordCheck/1.0",
      // Recommended to improve privacy
      "Add-Padding": "true",
    },
  });

  if (!res.ok) {
    throw new Error(`Password leak check failed (${res.status})`);
  }

  const body = await res.text();
  // Each line: SUFFIX:COUNT
  const lines = body.split("\n");
  for (const line of lines) {
    const [hashSuffix, countStr] = line.trim().split(":");
    if (!hashSuffix) continue;
    if (hashSuffix.toUpperCase() === suffix) {
      const count = Number(countStr || "0");
      return { leaked: true, count: Number.isFinite(count) ? count : undefined };
    }
  }
  return { leaked: false };
}

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
  const corsHeaders = getCorsHeaders(req);
  
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
      return new Response(
        JSON.stringify({ error: passwordValidation.message }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Leaked password protection (application-level mitigation)
    // If the upstream platform toggle is disabled, we still block known-compromised passwords here.
    try {
      const leaked = await isLeakedPassword(newPassword);
      if (leaked.leaked) {
        return new Response(
          JSON.stringify({ error: "此密碼曾出現在已外洩的密碼清單中，請更換為其他密碼" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }
    } catch (e) {
      // Fail-open to avoid blocking password resets during temporary network issues.
      // Strength validation still applies.
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
