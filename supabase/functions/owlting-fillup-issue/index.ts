// Admin endpoint: issue a magic-link fillup token + email accommodation owners.
// POST { staging_id: uuid, accommodation_id?: uuid (override), force?: boolean }
// Requires authenticated admin (super_admin / hotel_admin).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function renderEmail(opts: {
  ownerName: string;
  accommodationName: string;
  obe: string;
  checkIn: string | null;
  checkOut: string | null;
  magicUrl: string;
  dueAt: string | null;
}) {
  const dueLine = opts.dueAt
    ? `<p style="color:#b45309;margin:8px 0;">⏰ 請於 <strong>${opts.dueAt}</strong> 前補齊，逾期將每 24 小時自動提醒。</p>`
    : "";
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fafaf9;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
<h2 style="margin:0 0 8px;color:#111">${opts.accommodationName}：奧丁丁訂單需補齊住客資料</h2>
<p style="color:#555;margin:8px 0;">您好 ${opts.ownerName}，</p>
<p style="margin:8px 0;color:#333;">系統收到一筆奧丁丁訂單通知，但 OwlTing 信件本身不含住客電話/Email，請至 <strong>OwlNest 後台訂單列表</strong> 複製 PII 後到下方補單頁貼上。</p>
<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px;color:#333;">
<tr><td style="padding:6px 0;color:#888;width:90px;">訂單編號</td><td><strong>${opts.obe}</strong></td></tr>
<tr><td style="padding:6px 0;color:#888;">入住</td><td>${opts.checkIn ?? "—"} → ${opts.checkOut ?? "—"}</td></tr>
</table>
${dueLine}
<div style="margin:20px 0;">
<a href="${opts.magicUrl}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">前往補單頁</a>
</div>
<p style="font-size:12px;color:#999;margin-top:24px;">此連結 48 小時內有效、限本人使用；填完後自動失效。請勿轉寄。</p>
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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth: caller must be admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: roleData } = await admin
      .from("user_roles").select("role").eq("user_id", userData.user.id);
    const isAdmin = (roleData ?? []).some((r: any) => r.role === "super_admin" || r.role === "hotel_admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const stagingId = String(body.staging_id ?? "").trim();
    if (!stagingId) {
      return new Response(JSON.stringify({ error: "staging_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const accOverride = body.accommodation_id ? String(body.accommodation_id) : null;
    const silent = body.silent === true;

    // Load staging
    const { data: staging, error: stErr } = await admin
      .from("owlting_email_parsed_staging")
      .select("id, obe_number, accommodation_name, accommodation_id, check_in_date, check_out_date, pii_status, pii_due_at")
      .eq("id", stagingId)
      .single();
    if (stErr || !staging) {
      return new Response(JSON.stringify({ error: "Staging not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (staging.pii_status === "promoted_to_booking") {
      return new Response(JSON.stringify({ error: "Already promoted to order" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accId = accOverride ?? staging.accommodation_id;
    if (!accId) {
      return new Response(JSON.stringify({ error: "accommodation_id unresolved, please pass override" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Persist resolved acc on staging if missing
    if (!staging.accommodation_id) {
      await admin.from("owlting_email_parsed_staging")
        .update({ accommodation_id: accId }).eq("id", stagingId);
    }

    // Generate token
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

    const { error: tokErr } = await admin.from("owlting_fillup_tokens").insert({
      staging_id: stagingId,
      accommodation_id: accId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: userData.user.id,
    });
    if (tokErr) {
      return new Response(JSON.stringify({ error: "Token creation failed", detail: tokErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const magicUrl = `${FILLUP_BASE_URL}/owlting-fillup/${token}`;

    // Lookup owners
    const { data: owners } = await admin
      .from("accommodation_owners")
      .select("owner_name, email")
      .eq("accommodation_id", accId)
      .eq("is_active", true)
      .order("notify_priority", { ascending: true });

    // Lookup accommodation display name
    const { data: accInfo } = await admin
      .from("accommodation_info").select("name").eq("id", accId).maybeSingle();
    const accName = accInfo?.name ?? staging.accommodation_name ?? "民宿";

    let emailedTo: string[] = [];
    if (!silent && RESEND_API_KEY && owners && owners.length > 0) {
      for (const o of owners) {
        const html = renderEmail({
          ownerName: o.owner_name ?? "",
          accommodationName: accName,
          obe: staging.obe_number ?? "(無編號)",
          checkIn: staging.check_in_date,
          checkOut: staging.check_out_date,
          magicUrl,
          dueAt: staging.pii_due_at ? new Date(staging.pii_due_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) : null,
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
              subject: `【${accName}】奧丁丁訂單 ${staging.obe_number ?? ""} 需補齊住客資料`,
              html,
            }),
          });
          if (resp.ok) emailedTo.push(o.email);
          else console.error("[owlting-fillup-issue] resend failed:", await resp.text());
        } catch (e) {
          console.error("[owlting-fillup-issue] resend exception:", e);
        }
      }
    }

    if (!silent) {
      await admin.from("owlting_email_parsed_staging")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", stagingId);
    }

    return new Response(JSON.stringify({
      ok: true,
      magic_url: magicUrl,
      emailed_to: emailedTo,
      owners_count: owners?.length ?? 0,
      expires_at: expiresAt,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[owlting-fillup-issue] fatal:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
