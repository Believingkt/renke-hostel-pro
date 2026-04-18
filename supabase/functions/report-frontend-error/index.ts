// 接收前端崩潰回報並透過 Resend 即時告警管理員
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCorsHeaders } from "../_shared/cors.ts";

const THROTTLE_MINUTES = 15; // 同類錯誤 15 分鐘內不重複告警

// 簡單的 in-memory 速率限制：同一 IP 每分鐘最多 5 次
const ipRateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_PER_MINUTE = 5;

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
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!lovableKey || !resendKey) return false;

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #dc2626; margin: 0 0 16px;">⚠️ 前端載入失敗回報</h2>
      <p style="color: #374151;">用戶端在使用過程中發生錯誤，建議檢查近期部署或 CDN 快取狀態。</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px;">
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
      "https://connector-gateway.lovable.dev/resend/emails",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": resendKey,
        },
        body: JSON.stringify({
          from: "Lakeze 監控告警 <onboarding@resend.dev>",
          to: recipients,
          subject: `⚠️ [Lakeze 前端] ${payload.errorType} 錯誤回報`,
          html,
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
});

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
