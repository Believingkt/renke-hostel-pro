import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const inviteCode = typeof body?.invite_code === "string" ? body.invite_code.trim().toUpperCase() : "";
    const action = body?.action === "signup" ? "signup" : "lookup";
    if (!inviteCode || inviteCode.length > 32) return json({ error: "missing_invite_code" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: referral, error: refErr } = await admin
      .from("kol_referrals")
      .select("id, inviter_kol_id, invitee_kol_id, invite_code, status, is_active")
      .eq("invite_code", inviteCode)
      .maybeSingle();
    if (refErr) throw refErr;
    if (!referral || !referral.is_active) return json({ error: "invalid" }, 404);

    const { data: inviter } = await admin
      .from("kol_profiles")
      .select("id, name, ig_handle")
      .eq("id", referral.inviter_kol_id)
      .maybeSingle();

    if (action === "lookup") {
      return json({
        invite_code: referral.invite_code,
        status: referral.status,
        inviter_name: inviter?.name ?? null,
      });
    }

    if (referral.status === "joined") return json({ error: "already_joined" }, 409);

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const ig = typeof body?.ig_handle === "string" ? body.ig_handle.trim() : "";
    const contact = typeof body?.contact === "string" ? body.contact.trim() : "";
    if (!name || name.length > 100) return json({ error: "invalid_name" }, 400);
    if (ig.length > 100 || contact.length > 200) return json({ error: "invalid_input" }, 400);

    const { data: profile, error: pErr } = await admin
      .from("kol_profiles")
      .insert({
        name,
        ig_handle: ig || null,
        cid_configured: false,
        notes: `【網紅邀約網紅】邀請人：${inviter?.name ?? "—"}（邀請碼 ${referral.invite_code}）\n聯絡方式：${contact || "—"}\n狀態：待總部審核並發放折扣碼`,
      })
      .select("id, name")
      .maybeSingle();
    if (pErr) throw pErr;

    const { error: updErr } = await admin
      .from("kol_referrals")
      .update({
        invitee_kol_id: profile?.id ?? null,
        invitee_name: name,
        invitee_ig: ig || null,
        invitee_contact: contact || null,
        status: "joined",
        joined_at: new Date().toISOString(),
      })
      .eq("id", referral.id);
    if (updErr) throw updErr;

    return json({ ok: true, inviter_name: inviter?.name ?? null });
  } catch (err: any) {
    console.error("kol-referral-join error:", err);
    return json({ error: err?.message ?? "internal_error" }, 500);
  }
});
