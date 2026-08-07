// E2 再行銷發送（email 走既有 Resend 機制；line_share 產出可貼文案）
// POST /functions/v1/remarketing-send  body: { campaign_id, test_email?, dry_run?, limit? }
// 冪等：同一活動同一旅客已 sent 不重發（remarketing_sends 唯一索引）
// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { matchSegment, summarizeSegment, type TravelerRow } from "../_shared/remarketingSegment.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ADMIN_ROLES = ["super_admin", "admin", "hotel_admin", "owner"];
const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const FROM_EMAIL = "人客多 Lakeze <noreply@lakeze.com>";
const BRAND = { primary: "#d07218", foreground: "#2d3344", muted: "#6b7280" };

function emailHtml(opts: { name: string; body: string; ctaText: string; ctaUrl: string; products: string[] }) {
  const productList = opts.products.length
    ? `<ul style="color:${BRAND.foreground};font-size:15px;line-height:1.8;padding-left:20px;">${
        opts.products.map((p) => `<li>${p}</li>`).join("")
      }</ul>`
    : "";
  return `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8"/></head>
<body style="margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="padding:24px 16px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
      <div style="background:${BRAND.primary};padding:24px;text-align:center;color:#fff;font-size:18px;font-weight:700;">人客多 Lakeze</div>
      <div style="padding:32px 28px;">
        <h1 style="color:${BRAND.foreground};font-size:20px;margin:0 0 16px;">${opts.name} 您好</h1>
        <p style="color:${BRAND.muted};font-size:15px;line-height:1.8;margin:0 0 20px;white-space:pre-wrap;">${opts.body}</p>
        ${productList}
        ${opts.ctaUrl ? `<p style="text-align:center;margin:28px 0;"><a href="${opts.ctaUrl}" style="display:inline-block;background:${BRAND.primary};color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;">${opts.ctaText}</a></p>` : ""}
      </div>
      <div style="background:#fafafa;padding:18px;text-align:center;border-top:1px solid #eee;color:#999;font-size:12px;">
        © ${new Date().getFullYear()} 人客多 Lakeze
      </div>
    </div>
  </div>
</body></html>`;
}

const localized = (v: any): string => {
  if (!v) return "";
  if (typeof v === "string") return v;
  return String(v.zh ?? v["zh-TW"] ?? v.en ?? Object.values(v)[0] ?? "");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.replace(/^Bearer\s+/i, "").trim() !== serviceKey) {
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) return json({ error: "Unauthorized" }, 401);
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
      if (!(roles ?? []).some((r: any) => ADMIN_ROLES.includes(r.role))) return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const campaignId = String(body?.campaign_id ?? "");
    if (!campaignId) return json({ error: "campaign_id is required" }, 400);
    const testEmail = typeof body?.test_email === "string" ? body.test_email.trim() : "";
    const maxSend = Math.min(Math.max(Number(body?.limit) || 200, 1), 500);

    const { data: campaign, error: cErr } = await admin
      .from("remarketing_campaigns").select("*").eq("id", campaignId).maybeSingle();
    if (cErr) return json({ error: cErr.message }, 500);
    if (!campaign) return json({ error: "找不到活動" }, 404);

    // 推薦商品名稱
    const ids: string[] = Array.isArray(campaign.recommend_products) ? campaign.recommend_products : [];
    const productNames: string[] = [];
    if (ids.length) {
      const { data: prods } = await admin.from("trip_products").select("id,name").in("id", ids);
      for (const p of prods ?? []) productNames.push(localized((p as any).name));
    }

    // 分群
    const { data: profiles, error: pErr } = await admin
      .from("traveler_profiles")
      .select("id,display_name,email,phone,interest_tags,custom_needs,consumption,updated_at")
      .limit(5000);
    if (pErr) return json({ error: pErr.message }, 500);
    let targets = ((profiles ?? []) as TravelerRow[]).filter((p) => matchSegment(p, campaign.segment));

    // 已成功發送者略過（冪等）
    const { data: existing } = await admin
      .from("remarketing_sends").select("traveler_profile_id,status").eq("campaign_id", campaignId);
    const sentSet = new Set((existing ?? []).filter((r: any) => r.status === "sent").map((r: any) => r.traveler_profile_id));
    targets = targets.filter((t) => !sentSet.has(t.id)).slice(0, maxSend);

    const content = (campaign.content ?? {}) as any;
    const baseBody = String(content.body ?? "");
    const subject = String(content.subject ?? `人客多 — ${campaign.name}`);
    const ctaText = String(content.cta_text ?? "立即查看");
    const rawCta = String(content.cta_url ?? "");
    const channel = campaign.channel === "line_share" ? "line_share" : "email";
    const funcBase = `${supabaseUrl}/functions/v1`;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY_1");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const results: any[] = [];
    let sent = 0, failed = 0, skipped = 0;

    for (const t of targets) {
      const name = t.display_name || "旅人";
      const tags = (t.interest_tags ?? []).slice(0, 4);
      let personalBody = baseBody;
      if (tags.length) {
        personalBody = `${name}，看您先前對「${tags.join("、")}」特別有興趣，小安幫您挑了幾個回訪好選擇。\n${baseBody}`.trim();
      }

      const sendRow: any = {
        campaign_id: campaignId,
        traveler_profile_id: t.id,
        channel,
        recipient: channel === "email" ? (testEmail || t.email) : t.phone,
        message_body: personalBody,
      };

      if (channel === "line_share") {
        sendRow.status = "skipped";
        sendRow.error_message = "LINE 官方推播尚未介接，文案供人工複製發送";
        skipped++;
        results.push({ traveler_id: t.id, name, text: `${subject}\n${personalBody}\n${rawCta}` });
      } else if (!sendRow.recipient) {
        sendRow.status = "skipped";
        sendRow.error_message = "旅客無 Email";
        skipped++;
      } else if (body?.dry_run) {
        sendRow.status = "skipped";
        sendRow.error_message = "dry_run";
        skipped++;
      } else if (!RESEND_API_KEY || !LOVABLE_API_KEY) {
        sendRow.status = "failed";
        sendRow.error_message = "Resend 未設定";
        failed++;
      } else {
        // 先建立紀錄取得 send id，CTA 追蹤連結才能帶
        const { data: pre, error: preErr } = await admin
          .from("remarketing_sends")
          .upsert({ ...sendRow, status: "sent" }, { onConflict: "campaign_id,traveler_profile_id" })
          .select("id").maybeSingle();
        if (preErr) { failed++; results.push({ traveler_id: t.id, error: preErr.message }); continue; }

        const trackUrl = rawCta
          ? `${funcBase}/remarketing-track?s=${pre?.id}&u=${encodeURIComponent(rawCta)}`
          : "";
        const html = emailHtml({ name, body: personalBody, ctaText, ctaUrl: trackUrl, products: productNames });

        const resp = await fetch(`${GATEWAY_URL}/emails`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": RESEND_API_KEY,
          },
          body: JSON.stringify({ from: FROM_EMAIL, to: [sendRow.recipient], subject, html }),
        });
        const respBody = await resp.text();
        if (!resp.ok) {
          failed++;
          console.error(`[remarketing-send] Resend ${resp.status}: ${respBody}`);
          await admin.from("remarketing_sends")
            .update({ status: "failed", error_message: `Resend ${resp.status}: ${respBody.slice(0, 300)}` })
            .eq("id", pre?.id);
          results.push({ traveler_id: t.id, error: `Resend ${resp.status}` });
        } else {
          sent++;
          results.push({ traveler_id: t.id, email: sendRow.recipient, ok: true });
        }
        continue;
      }

      const { error: iErr } = await admin
        .from("remarketing_sends")
        .upsert(sendRow, { onConflict: "campaign_id,traveler_profile_id" });
      if (iErr) results.push({ traveler_id: t.id, error: iErr.message });
    }

    if (!body?.dry_run && (sent > 0 || (channel === "line_share" && targets.length > 0))) {
      await admin.from("remarketing_campaigns")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", campaignId);
    }

    return json({
      success: true,
      summary: summarizeSegment(campaign.segment),
      matched: targets.length,
      sent, failed, skipped,
      channel,
      results: results.slice(0, 100),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
