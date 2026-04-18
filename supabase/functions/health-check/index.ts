// 系統健檢 Edge Function — 由 pg_cron 每 10 分鐘觸發
// 對首頁進行 HTTP 狀態檢查，失敗時透過 Resend 寄送告警給管理員
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TARGETS = [
  { url: "https://booking.lakeze.com", label: "訂房入口" },
];

const TIMEOUT_MS = 10_000;
const THROTTLE_MINUTES = 30; // 同一個 alert_key 30 分鐘內不重複發送

async function checkUrl(url: string): Promise<{
  status_code: number | null;
  response_time_ms: number;
  is_healthy: boolean;
  error_message: string | null;
}> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Lakeze-HealthCheck/1.0" },
    });
    clearTimeout(timer);

    const elapsed = Date.now() - start;
    const isHealthy = res.status >= 200 && res.status < 400;

    return {
      status_code: res.status,
      response_time_ms: elapsed,
      is_healthy: isHealthy,
      error_message: isHealthy ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      status_code: null,
      response_time_ms: Date.now() - start,
      is_healthy: false,
      error_message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function shouldSendAlert(
  supabase: ReturnType<typeof createClient>,
  alertKey: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("alert_throttle")
    .select("last_sent_at")
    .eq("alert_key", alertKey)
    .maybeSingle();

  if (!data) return true;

  const lastSent = new Date((data as any).last_sent_at).getTime();
  const elapsedMin = (Date.now() - lastSent) / 60_000;
  return elapsedMin >= THROTTLE_MINUTES;
}

async function recordAlertSent(
  supabase: ReturnType<typeof createClient>,
  alertKey: string,
): Promise<void> {
  await supabase
    .from("alert_throttle")
    .upsert({ alert_key: alertKey, last_sent_at: new Date().toISOString() }, {
      onConflict: "alert_key",
    });
}

async function sendAlertEmail(
  recipients: string[],
  subject: string,
  htmlBody: string,
): Promise<boolean> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");

  if (!lovableKey || !resendKey) {
    console.error("Missing LOVABLE_API_KEY or RESEND_API_KEY");
    return false;
  }

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
          subject,
          html: htmlBody,
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      console.error(`Resend failed [${res.status}]: ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Resend error:", err);
    return false;
  }
}

function buildAlertHtml(
  target: { url: string; label: string },
  result: {
    status_code: number | null;
    response_time_ms: number;
    error_message: string | null;
  },
): string {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #dc2626; margin: 0 0 16px;">🚨 系統健檢失敗</h2>
      <p style="color: #374151; margin: 0 0 8px;">
        以下監控目標在最近一次健檢中未能正常回應，請儘速確認。
      </p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px;">
        <tr>
          <td style="padding: 8px; background: #f3f4f6; font-weight: 600; width: 30%;">目標</td>
          <td style="padding: 8px;">${target.label}</td>
        </tr>
        <tr>
          <td style="padding: 8px; background: #f3f4f6; font-weight: 600;">URL</td>
          <td style="padding: 8px;"><a href="${target.url}">${target.url}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px; background: #f3f4f6; font-weight: 600;">HTTP 狀態</td>
          <td style="padding: 8px;">${result.status_code ?? "（無回應）"}</td>
        </tr>
        <tr>
          <td style="padding: 8px; background: #f3f4f6; font-weight: 600;">回應時間</td>
          <td style="padding: 8px;">${result.response_time_ms} ms</td>
        </tr>
        <tr>
          <td style="padding: 8px; background: #f3f4f6; font-weight: 600;">錯誤訊息</td>
          <td style="padding: 8px; color: #dc2626;">${result.error_message ?? "—"}</td>
        </tr>
        <tr>
          <td style="padding: 8px; background: #f3f4f6; font-weight: 600;">時間</td>
          <td style="padding: 8px;">${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</td>
        </tr>
      </table>
      <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
        若同一目標持續失敗，30 分鐘內僅會收到一次告警。請至 HQ → 系統健康監控 查看詳細歷史。
      </p>
    </div>
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const results: any[] = [];

  for (const target of TARGETS) {
    const result = await checkUrl(target.url);
    let alertSent = false;

    // 寫入健檢日誌
    const { data: logRow } = await supabase
      .from("system_health_logs")
      .insert({
        target_url: target.url,
        target_label: target.label,
        status_code: result.status_code,
        response_time_ms: result.response_time_ms,
        is_healthy: result.is_healthy,
        error_message: result.error_message,
      })
      .select("id")
      .single();

    // 失敗 → 嘗試寄告警
    if (!result.is_healthy) {
      const alertKey = `health:${target.url}`;
      const canSend = await shouldSendAlert(supabase, alertKey);

      if (canSend) {
        const { data: recipients } = await supabase
          .from("alert_recipients")
          .select("email")
          .eq("is_active", true)
          .eq("notify_health_check", true);

        const emails = (recipients ?? []).map((r: any) => r.email);

        if (emails.length > 0) {
          const ok = await sendAlertEmail(
            emails,
            `🚨 [Lakeze 監控] ${target.label} 健檢失敗`,
            buildAlertHtml(target, result),
          );
          if (ok) {
            await recordAlertSent(supabase, alertKey);
            alertSent = true;
            if (logRow) {
              await supabase
                .from("system_health_logs")
                .update({ alert_sent: true })
                .eq("id", (logRow as any).id);
            }
          }
        } else {
          console.log("No active alert recipients configured");
        }
      }
    }

    results.push({
      target: target.label,
      url: target.url,
      ...result,
      alert_sent: alertSent,
    });
  }

  return new Response(
    JSON.stringify({ checked_at: new Date().toISOString(), results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
