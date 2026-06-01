// Cron-triggered: re-send PII fillup notifications for staging rows that:
//   - pii_status = 'pending_pii_fillup'
//   - have been notified at least once (notified_at is not null)
//   - last reminder (or initial notification) was > 24h ago
// Issues a fresh magic-link token (old ones may still be valid until 48h TTL)
// and emails owners again. Marks last_reminder_at on success.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FILLUP_BASE_URL = Deno.env.get("FILLUP_BASE_URL") ?? "https://booking.lakeze.com";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "Lakeze <noreply@lakeze.com>";

function randomToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function renderReminderEmail(opts: {
  ownerName: string;
  accommodationName: string;
  obe: string;
  checkIn: string | null;
  checkOut: string | null;
  magicUrl: string;
  overdue: boolean;
}) {
  const banner = opts.overdue
    ? `<div style="background:#fee2e2;color:#991b1b;padding:10px 14px;border-radius:8px;margin-bottom:12px;font-weight:600;">⚠️ 此訂單補單已逾期，請儘快處理</div>`
    : `<div style="background:#fef3c7;color:#92400e;padding:10px 14px;border-radius:8px;margin-bottom:12px;font-weight:600;">⏰ 提醒：奧丁丁訂單仍待補齊住客資料</div>`;
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fafaf9;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
${banner}
<h2 style="margin:0 0 8px;color:#111">${opts.accommodationName}：訂單 ${opts.obe} 提醒</h2>
<p style="color:#555;margin:8px 0;">您好 ${opts.ownerName}，</p>
<p style="margin:8px 0;color:#333;">這筆奧丁丁訂單仍待補齊住客電話/Email，請至 OwlNest 後台複製後到下方補單頁貼上。</p>
<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px;color:#333;">
<tr><td style="padding:6px 0;color:#888;width:90px;">訂單編號</td><td><strong>${opts.obe}</strong></td></tr>
<tr><td style="padding:6px 0;color:#888;">入住</td><td>${opts.checkIn ?? "—"} → ${opts.checkOut ?? "—"}</td></tr>
</table>
<div style="margin:20px 0;">
<a href="${opts.magicUrl}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">前往補單頁</a>
</div>
<p style="font-size:12px;color:#999;margin-top:24px;">此連結 48 小時內有效；逾期未補將每 24 小時自動再次提醒。</p>
</div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    // Pull pending PII rows that already had an initial notification,
    // where last reminder (fallback to notified_at) is older than 24h.
    const { data: candidates, error: qErr } = await admin
      .from("owlting_email_parsed_staging")
      .select("id, obe_number, accommodation_id, accommodation_name, check_in_date, check_out_date, pii_due_at, notified_at, last_reminder_at")
      .eq("pii_status", "pending_pii_fillup")
      .not("notified_at", "is", null)
      .not("accommodation_id", "is", null)
      .or(`last_reminder_at.is.null,last_reminder_at.lt.${cutoff}`)
      .limit(50);

    if (qErr) throw qErr;

    // Filter rows whose initial notified_at is also older than 24h (covers null last_reminder_at)
    const due = (candidates ?? []).filter((r: any) => {
      const ref = r.last_reminder_at ?? r.notified_at;
      return ref && new Date(ref).toISOString() < cutoff;
    });

    let processed = 0;
    let emailsSent = 0;

    for (const row of due) {
      const { data: owners } = await admin
        .from("accommodation_owners")
        .select("owner_name, email")
        .eq("accommodation_id", row.accommodation_id)
        .eq("is_active", true)
        .order("notify_priority", { ascending: true });

      if (!owners || owners.length === 0) continue;

      // Issue fresh token (48h TTL)
      const token = randomToken();
      const tokenHash = await sha256Hex(token);
      const expiresAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

      const { error: tokErr } = await admin.from("owlting_fillup_tokens").insert({
        staging_id: row.id,
        accommodation_id: row.accommodation_id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });
      if (tokErr) {
        console.error("[remind] token insert failed:", tokErr.message);
        continue;
      }

      const magicUrl = `${FILLUP_BASE_URL}/owlting-fillup/${token}`;
      const { data: accInfo } = await admin
        .from("accommodation_info").select("name").eq("id", row.accommodation_id).maybeSingle();
      const accName = accInfo?.name ?? row.accommodation_name ?? "民宿";
      const overdue = row.pii_due_at ? new Date(row.pii_due_at) < new Date() : false;

      if (RESEND_API_KEY) {
        for (const o of owners) {
          const html = renderReminderEmail({
            ownerName: o.owner_name ?? "",
            accommodationName: accName,
            obe: row.obe_number ?? "(無編號)",
            checkIn: row.check_in_date,
            checkOut: row.check_out_date,
            magicUrl,
            overdue,
          });
          try {
            const resp = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: FROM_EMAIL,
                to: [o.email],
                subject: `${overdue ? "⚠️ 逾期提醒" : "⏰ 提醒"}【${accName}】奧丁丁訂單 ${row.obe_number ?? ""} 待補住客資料`,
                html,
              }),
            });
            if (resp.ok) emailsSent++;
            else console.error("[remind] resend failed:", await resp.text());
          } catch (e) {
            console.error("[remind] resend exception:", e);
          }
        }
      }

      await admin
        .from("owlting_email_parsed_staging")
        .update({ last_reminder_at: nowIso })
        .eq("id", row.id);

      processed++;
    }

    return new Response(JSON.stringify({
      ok: true,
      candidates: candidates?.length ?? 0,
      processed,
      emails_sent: emailsSent,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[owlting-fillup-remind] fatal:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
