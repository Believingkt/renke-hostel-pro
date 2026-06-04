// Auto-notify accommodation owners for OwlTing cancel / modify emails.
// POST { staging_id: uuid }
// Internal: invoked from owlting-email-ingest after a cancel/modify row is staged.
// Idempotent: skips if last_send_status already 'success' for the same message_type.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY_1") ?? Deno.env.get("RESEND_API_KEY");
const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "人客多 Lakeze <noreply@sensaninn.lakeze.com>";

function renderEmail(opts: {
  ownerName: string;
  accommodationName: string;
  obe: string;
  checkIn: string | null;
  checkOut: string | null;
  changeType: "cancelled" | "modified";
}) {
  const isCancel = opts.changeType === "cancelled";
  const title = isCancel
    ? `${opts.accommodationName}：奧丁丁訂單已取消`
    : `${opts.accommodationName}：奧丁丁訂單已修改`;
  const intro = isCancel
    ? "您收到一封來自奧丁丁的「取消」通知，請至奧丁丁系統後台確認並同步取消這筆訂單。"
    : "您收到一封來自奧丁丁的「修改」通知，請至奧丁丁系統後台確認本次變更內容並同步更新。";
  const accent = isCancel ? "#dc2626" : "#d97706";
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fafaf9;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
<h2 style="margin:0 0 8px;color:${accent}">${title}</h2>
<p style="color:#555;margin:8px 0;">您好 ${opts.ownerName}，</p>
<p style="margin:8px 0;color:#333;">${intro}</p>
<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px;color:#333;">
<tr><td style="padding:6px 0;color:#888;width:90px;">訂單編號</td><td><strong>${opts.obe}</strong></td></tr>
<tr><td style="padding:6px 0;color:#888;">入住</td><td>${opts.checkIn ?? "—"} → ${opts.checkOut ?? "—"}</td></tr>
<tr><td style="padding:6px 0;color:#888;">通知類型</td><td><strong style="color:${accent}">${isCancel ? "取消" : "修改"}</strong></td></tr>
</table>
<p style="font-size:12px;color:#999;margin-top:24px;">此為系統自動轉寄通知，詳情請以奧丁丁系統後台為準。</p>
</div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const stagingId = String(body.staging_id ?? "").trim();
    if (!stagingId) {
      return new Response(JSON.stringify({ error: "staging_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: staging, error: stErr } = await admin
      .from("owlting_email_parsed_staging")
      .select("id, obe_number, accommodation_name, accommodation_id, check_in_date, check_out_date, message_type, last_send_status, last_send_attempts")
      .eq("id", stagingId)
      .single();
    if (stErr || !staging) {
      return new Response(JSON.stringify({ error: "Staging not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const changeType = staging.message_type;
    if (changeType !== "cancelled" && changeType !== "modified") {
      return new Response(JSON.stringify({ skipped: "not_change_type" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!staging.accommodation_id) {
      return new Response(JSON.stringify({ skipped: "no_accommodation" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Idempotent: don't re-send if already succeeded
    if (staging.last_send_status === "success") {
      return new Response(JSON.stringify({ skipped: "already_sent" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: owners } = await admin
      .from("accommodation_owners")
      .select("owner_name, email")
      .eq("accommodation_id", staging.accommodation_id)
      .eq("is_active", true)
      .order("notify_priority", { ascending: true });

    const { data: accInfo } = await admin
      .from("accommodation_info").select("name").eq("id", staging.accommodation_id).maybeSingle();
    const accName = accInfo?.name ?? staging.accommodation_name ?? "民宿";

    let emailedTo: string[] = [];
    let emailErrors: string[] = [];

    if (LOVABLE_API_KEY && RESEND_API_KEY && owners && owners.length > 0) {
      for (const o of owners) {
        const html = renderEmail({
          ownerName: o.owner_name ?? "",
          accommodationName: accName,
          obe: staging.obe_number ?? "(無編號)",
          checkIn: staging.check_in_date,
          checkOut: staging.check_out_date,
          changeType,
        });
        try {
          const resp = await fetch(`${GATEWAY_URL}/emails`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LOVABLE_API_KEY}`,
              "X-Connection-Api-Key": RESEND_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: FROM_EMAIL,
              to: [o.email],
              subject: `【${accName}】奧丁丁訂單 ${staging.obe_number ?? ""} ${changeType === "cancelled" ? "已取消" : "已修改"}`,
              html,
            }),
          });
          if (resp.ok) emailedTo.push(o.email);
          else {
            const errorText = await resp.text();
            emailErrors.push(`${o.email}: ${errorText}`);
            console.error("[owlting-change-notify] resend failed:", errorText);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          emailErrors.push(`${o.email}: ${msg}`);
          console.error("[owlting-change-notify] resend exception:", e);
        }
      }
    }

    const ownersCount = owners?.length ?? 0;
    let sendStatus: "success" | "partial" | "failed";
    let sendMessage: string;
    if (ownersCount === 0) {
      sendStatus = "failed";
      sendMessage = "尚未設定業主聯絡人";
    } else if (emailedTo.length === ownersCount) {
      sendStatus = "success";
      sendMessage = `[${changeType === "cancelled" ? "取消" : "修改"}通知] 已寄送 ${emailedTo.length} 位業主：${emailedTo.join(", ")}`;
    } else if (emailedTo.length > 0) {
      sendStatus = "partial";
      sendMessage = `[${changeType === "cancelled" ? "取消" : "修改"}通知] 成功 ${emailedTo.length}/${ownersCount}；失敗：${emailErrors.join(" | ")}`;
    } else {
      sendStatus = "failed";
      sendMessage = `[${changeType === "cancelled" ? "取消" : "修改"}通知] ${emailErrors.join(" | ") || "未知錯誤"}`;
    }

    const patch: Record<string, unknown> = {
      last_send_status: sendStatus,
      last_send_message: sendMessage.slice(0, 2000),
      last_send_at: new Date().toISOString(),
      last_send_attempts: ((staging.last_send_attempts ?? 0) as number) + 1,
    };
    if (emailedTo.length > 0) patch.notified_at = new Date().toISOString();
    await admin.from("owlting_email_parsed_staging").update(patch).eq("id", stagingId);

    return new Response(JSON.stringify({
      ok: true,
      emailed_to: emailedTo,
      email_errors: emailErrors,
      owners_count: ownersCount,
      send_status: sendStatus,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[owlting-change-notify] fatal:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
