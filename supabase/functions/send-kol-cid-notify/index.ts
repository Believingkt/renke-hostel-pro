import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatTaiwanTime(date: Date): string {
  const utc8 = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const yyyy = utc8.getUTCFullYear();
  const mm = String(utc8.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc8.getUTCDate()).padStart(2, "0");
  const hh = String(utc8.getUTCHours()).padStart(2, "0");
  const mi = String(utc8.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} | ${hh}:${mi}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { kol_profile_id } = await req.json().catch(() => ({}));
    if (!kol_profile_id || typeof kol_profile_id !== "string") {
      return jsonResponse({ success: false, message: "kol_profile_id is required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile, error: profileErr } = await supabase
      .from("kol_profiles")
      .select("id, name, venue_name, cid_code, order_number, check_in_date, cid_notified, cid_configured, scout_name")
      .eq("id", kol_profile_id)
      .maybeSingle();

    if (profileErr) {
      console.error("[send-kol-cid-notify] profile lookup error:", profileErr);
      return jsonResponse({ success: false, message: profileErr.message }, 500);
    }
    if (!profile) {
      return jsonResponse({ success: false, message: "kol_profile not found" }, 404);
    }

    if (!profile.cid_code || !profile.order_number || profile.cid_notified) {
      return jsonResponse({
        success: true,
        message: "skip: conditions not met",
        skipped: true,
      });
    }

    // venue settings (optional context)
    const { data: venueSetting } = await supabase
      .from("kol_venue_settings")
      .select("is_starlink, contact_email, has_external_platform")
      .eq("venue_name", profile.venue_name)
      .maybeSingle();

    // accommodation_info match
    const { data: accInfo } = await supabase
      .from("accommodation_info")
      .select("name")
      .eq("name", profile.venue_name)
      .maybeSingle();

    const venueType = accInfo?.name ? "PMS內部" : "非PMS";
    const createdAt = formatTaiwanTime(new Date());

    const subject = `【KOL折扣碼_協助設定通知】${profile.venue_name} - ${profile.name} - ${profile.cid_code}`;
    const text = [
      "請夥伴協助新增折扣碼🙏🙏",
      `館別：${profile.venue_name ?? "-"}`,
      `類型：${venueType}`,
      `KOL名稱：${profile.name ?? "-"}`,
      `折扣碼 / CID：${profile.cid_code ?? "-"}`,
      `入住日期：${profile.check_in_date ?? "-"}`,
      `星探：${profile.scout_name ?? "-"}`,
      `訂單編號：${profile.order_number ?? "-"}`,
      `建立時間：${createdAt}`,
    ].join("\n");

    const { error: sendErr } = await resend.emails.send({
      from: "人客多通知 <noreply@sensaninn.lakeze.com>",
      to: ["service@lakeze.com"],
      subject,
      text,
    });

    if (sendErr) {
      console.error("[send-kol-cid-notify] resend error:", sendErr);
      return jsonResponse({ success: false, message: sendErr.message ?? "send failed" }, 500);
    }

    const { error: updErr } = await supabase
      .from("kol_profiles")
      .update({ cid_notified: true })
      .eq("id", profile.id);

    if (updErr) {
      console.error("[send-kol-cid-notify] update cid_notified error:", updErr);
      return jsonResponse({ success: true, message: "email sent but failed to update flag" });
    }

    console.log("[send-kol-cid-notify] sent", {
      kol_profile_id: profile.id,
      venue_setting: venueSetting,
    });

    return jsonResponse({ success: true, message: "notification sent" });
  } catch (e) {
    console.error("[send-kol-cid-notify] unexpected error:", e);
    return jsonResponse({ success: false, message: (e as Error).message }, 500);
  }
});
