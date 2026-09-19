// 接收前端崩潰回報並透過 Resend 即時告警管理員
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCorsHeaders } from "../_shared/cors.ts";

const THROTTLE_MINUTES = 15; // 同類錯誤 15 分鐘內不重複告警

// 簡單的 in-memory 速率限制：同一 IP 每分鐘最多 5 次
const ipRateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_PER_MINUTE = 5;

const BOT_KEYWORDS = [
  "googlebot",
  "bingbot",
  "duckduckbot",
  "baiduspider",
  "yandexbot",
  "crawler",
  "spider",
  "headless",
  "slurp",
  "robot",
  "bot",
];

function detectBotKeyword(userAgent?: string): string | null {
  if (!userAgent) return null;
  const normalized = userAgent.toLowerCase();
  return BOT_KEYWORDS.find((keyword) => normalized.includes(keyword)) ?? null;
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = ipRateLimit.get(ip);

  if (!record || now > record.resetAt) {
    ipRateLimit.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (record.count >= RATE_LIMIT_PER_MINUTE) return false;
  record.count++;
  return true;
}

async function sendAlertEmail(
  recipients: string[],
  payload: {
    errorType: string;
    errorMessage: string;
    url?: string;
    userAgent?: string;
  },
): Promise<boolean> {
  const resendKey = Deno.env.get("RESEND_API_KEY_LAKEZE") ?? Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return false;

  const botKeyword = detectBotKeyword(payload.userAgent);
  const isBot = botKeyword !== null;
  const isChunkLoadFailure = payload.errorType === "chunk_load_failure";
  const urgency = isBot ? "⚪ 低急迫" : "🟡 中急迫";
  const conclusion = isChunkLoadFailure
    ? "有瀏覽器沒有成功載入頁面的功能模組，最常見原因是網站剛部署過新版本，對方瀏覽器手上還是舊版頁面"
    : "使用者瀏覽器在使用過程中發生了一個前端錯誤";
  const source = isBot
    ? `疑似搜尋引擎機器人（比對到關鍵字：${botKeyword}）`
    : "真人瀏覽器";
  const action = isBot
    ? "通常不影響真人客戶，先不用處理，除非同一頁面持續大量出現"
    : isChunkLoadFailure
    ? "如果近期有部署新版本，這是正常現象，通常使用者重新整理就會恢復。如果同一頁面持續出現，需要進一步查"
    : "請查看錯誤訊息判斷影響範圍，如有真人客戶回報同樣問題，需儘快處理";

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <div style="display:inline-block;background:${isBot ? "#f3f4f6" : "#fef3c7"};color:${isBot ? "#4b5563" : "#92400e"};font-size:13px;font-weight:700;padding:6px 10px;border-radius:4px;margin-bottom:16px;">${urgency}</div>
      <h2 style="color:#111827;margin:0 0 12px;font-size:22px;">${conclusion}</h2>
      <p style="color:#374151;margin:0 0 12px;line-height:1.7;"><strong>👤 觸發來源：</strong>${escapeHtml(source)}</p>
      <p style="color:#374151;margin:0 0 20px;line-height:1.7;"><strong>建議動作：</strong>${action}</p>
      <div style="border-top:1px solid #d1d5db;margin:0 0 16px;padding-top:16px;color:#6b7280;font-size:13px;font-weight:700;">技術細節</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 8px; background: #f3f4f6; font-weight: 600; width: 30%;">錯誤類型</td><td style="padding: 8px;">${escapeHtml(payload.errorType)}</td></tr>
        <tr><td style="padding: 8px; background: #f3f4f6; font-weight: 600;">錯誤訊息</td><td style="padding: 8px; color: #dc2626;">${escapeHtml(payload.errorMessage)}</td></tr>
        <tr><td style="padding: 8px; background: #f3f4f6; font-weight: 600;">頁面 URL</td><td style="padding: 8px;">${escapeHtml(payload.url ?? "—")}</td></tr>
        <tr><td style="padding: 8px; background: #f3f4f6; font-weight: 600;">User Agent</td><td style="padding: 8px; font-size: 12px;">${escapeHtml(payload.userAgent ?? "—")}</td></tr>
        <tr><td style="padding: 8px; background: #f3f4f6; font-weight: 600;">時間</td><td style="padding: 8px;">${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</td></tr>
      </table>
      <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
        相同錯誤 15 分鐘內僅會通知一次。詳細歷史請至 HQ → 系統健康監控查看。
      </p>
    </div>
  `;

  try {
    const res = await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: "Lakeze 監控告警 <noreply@lakeze.com>",
          to: recipients,
          subject: `${isBot ? "⚪" : "🟡"} [Lakeze 前端] ${payload.errorType} 錯誤回報`,
          html,
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ?? "unknown";

  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const errorType = String(body.errorType ?? "unknown").slice(0, 100);
  const errorMessage = String(body.errorMessage ?? "(no message)").slice(0, 5000);
  const url = body.url ? String(body.url).slice(0, 2000) : null;
  const userAgent = body.userAgent ? String(body.userAgent).slice(0, 1000) : null;
  const context = body.context && typeof body.context === "object"
    ? body.context
    : null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 寫入回報
  const { data: report, error: insertErr } = await supabase
    .from("frontend_error_reports")
    .insert({
      error_type: errorType,
      error_message: errorMessage,
      url,
      user_agent: userAgent,
      context,
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("Insert error:", insertErr);
    return new Response(JSON.stringify({ error: "Insert failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 節流檢查
  const alertKey = `frontend:${errorType}:${errorMessage.slice(0, 100)}`;

  const { data: throttle } = await supabase
    .from("alert_throttle")
    .select("last_sent_at")
    .eq("alert_key", alertKey)
    .maybeSingle();

  const canSend = !throttle ||
    (Date.now() - new Date((throttle as any).last_sent_at).getTime()) /
          60_000 >= THROTTLE_MINUTES;

  let alertSent = false;
  if (canSend) {
    const { data: recipients } = await supabase
      .from("alert_recipients")
      .select("email")
      .eq("is_active", true)
      .eq("notify_frontend_error", true);

    const emails = (recipients ?? []).map((r: any) => r.email);

    if (emails.length > 0) {
      const ok = await sendAlertEmail(emails, {
        errorType,
        errorMessage,
        url: url ?? undefined,
        userAgent: userAgent ?? undefined,
      });
      if (ok) {
        await supabase.from("alert_throttle").upsert(
          { alert_key: alertKey, last_sent_at: new Date().toISOString() },
          { onConflict: "alert_key" },
        );
        await supabase
          .from("frontend_error_reports")
          .update({ alert_sent: true })
          .eq("id", (report as any).id);
        alertSent = true;
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, alert_sent: alertSent }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
