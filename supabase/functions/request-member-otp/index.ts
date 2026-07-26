import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// 驗證碼寄送限流參數
const MIN_INTERVAL_SEC = 60; // 同一 email 兩次寄送最短間隔
const EMAIL_MAX_PER_WINDOW = 3; // 同一 email 每 15 分鐘上限
const EMAIL_WINDOW_SEC = 15 * 60;
const EMAIL_MAX_PER_HOUR = 5; // 同一 email 每小時上限
const IP_MAX_PER_HOUR = 15; // 同一來源 IP 每小時上限
const HOUR_SEC = 60 * 60;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: { email?: unknown; redirectTo?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || email.length > 320 || !EMAIL_RE.test(email)) {
    return json({ error: "請輸入有效的 Email" }, 400);
  }
  const redirectTo = typeof payload.redirectTo === "string" && payload.redirectTo.startsWith("http")
    ? payload.redirectTo
    : undefined;

  const ip =
    req.headers.get("cf-connecting-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown";

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const nowMs = Date.now();
  const sinceHour = new Date(nowMs - HOUR_SEC * 1000).toISOString();

  const { data: attempts, error: readErr } = await admin
    .from("otp_send_attempts")
    .select("email, ip, created_at")
    .gte("created_at", sinceHour)
    .or(`email.eq.${email},ip.eq.${ip}`);

  if (readErr) {
    console.error("otp attempts read failed", readErr.message);
    return json({ error: "系統忙碌中，請稍後再試" }, 500);
  }

  const rows = attempts ?? [];
  const emailTimes = rows
    .filter((r) => r.email === email)
    .map((r) => new Date(r.created_at as string).getTime())
    .sort((a, b) => b - a);
  const ipCount = rows.filter((r) => r.ip === ip).length;

  // 計算下一次可寄送時間（取所有規則中最晚者）
  let nextAllowedMs = 0;
  const bump = (ms: number) => {
    if (ms > nextAllowedMs) nextAllowedMs = ms;
  };

  if (emailTimes.length > 0) {
    bump(emailTimes[0] + MIN_INTERVAL_SEC * 1000);
  }
  const inWindow = emailTimes.filter((t) => t > nowMs - EMAIL_WINDOW_SEC * 1000);
  if (inWindow.length >= EMAIL_MAX_PER_WINDOW) {
    bump(Math.min(...inWindow) + EMAIL_WINDOW_SEC * 1000);
  }
  if (emailTimes.length >= EMAIL_MAX_PER_HOUR) {
    bump(Math.min(...emailTimes) + HOUR_SEC * 1000);
  }
  if (ipCount >= IP_MAX_PER_HOUR) {
    const ipTimes = rows
      .filter((r) => r.ip === ip)
      .map((r) => new Date(r.created_at as string).getTime());
    bump(Math.min(...ipTimes) + HOUR_SEC * 1000);
  }

  if (nextAllowedMs > nowMs) {
    const retryAfter = Math.ceil((nextAllowedMs - nowMs) / 1000);
    return json(
      {
        error: "rate_limited",
        message:
          retryAfter > 120
            ? `驗證碼要求次數過多，請於 ${Math.ceil(retryAfter / 60)} 分鐘後再試，或直接輸入先前收到的驗證碼。`
            : `請稍候 ${retryAfter} 秒後再重新寄送驗證碼，或直接輸入先前收到的驗證碼。`,
        retry_after: retryAfter,
        next_allowed_at: new Date(nextAllowedMs).toISOString(),
      },
      429,
    );
  }

  // 先記錄要求，避免併發重複寄送
  const { error: insErr } = await admin.from("otp_send_attempts").insert({ email, ip });
  if (insErr) {
    console.error("otp attempts insert failed", insErr.message);
    return json({ error: "系統忙碌中，請稍後再試" }, 500);
  }

  const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false },
  });

  const { error: sendErr } = await anon.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
  });

  const nextAllowedAt = new Date(Date.now() + MIN_INTERVAL_SEC * 1000).toISOString();

  if (sendErr) {
    const raw = (sendErr.message || "").toLowerCase();
    if (raw.includes("rate") || raw.includes("many") || (sendErr as { status?: number }).status === 429) {
      return json(
        {
          error: "rate_limited",
          message: "驗證碼要求次數過多，請稍後再試，或直接輸入先前收到的驗證碼。",
          retry_after: MIN_INTERVAL_SEC,
          next_allowed_at: nextAllowedAt,
        },
        429,
      );
    }
    return json(
      {
        error: "send_failed",
        message: raw.includes("not confirmed")
          ? "此信箱尚未完成驗證，請先透過重設密碼流程驗證。"
          : (sendErr.message || "驗證碼寄送失敗，請稍後再試。"),
        next_allowed_at: nextAllowedAt,
      },
      400,
    );
  }

  return json({ sent: true, next_allowed_at: nextAllowedAt, retry_after: MIN_INTERVAL_SEC });
});
