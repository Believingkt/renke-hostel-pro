// 社群裂變推廣（D2）— 邀請連結追蹤、註冊歸因、成單獎勵發放
// POST /functions/v1/referral-hook
// actions:
//  - get_link      { campaign_id? }             需登入：取得/建立我的邀請連結
//  - track_click   { code }                     公開：點擊計數
//  - register      { code, member_id }          受邀者註冊回填
//  - qualify       { member_id, order_id }      受邀者成單 → tier1/tier2 獎勵
// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randCode = (n = 8) =>
  Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");

type Tier = {
  tier: number;
  condition?: string;
  reward_type?: "points" | "coupon";
  reward_value?: number;
};

function pickTier(tiers: any, tier: number): Tier | null {
  if (!Array.isArray(tiers)) return null;
  return tiers.find((t: any) => Number(t?.tier) === tier) ?? null;
}

async function grantReward(
  admin: any,
  memberId: string,
  rule: Tier,
  campaignId: string,
  accommodationId: string | null,
) {
  const value = Number(rule.reward_value || 0);
  if (!memberId || value <= 0) return { granted: false };

  if (rule.reward_type === "coupon") {
    const code = `REF${randCode(8)}`;
    const validUntil = new Date(Date.now() + 90 * 86400000).toISOString();
    const { data: coupon, error } = await admin
      .from("platform_coupons")
      .insert({
        code,
        coupon_type: "fixed",
        coupon_value: Math.round(value),
        scope: accommodationId ? "accommodation" : "platform",
        accommodation_id: accommodationId,
        usage_limit: 1,
        per_member_limit: 1,
        valid_until: validUntil,
      })
      .select("id")
      .single();
    if (error) return { granted: false, error: error.message };
    await admin.from("member_coupon_distributions").insert({
      coupon_id: coupon.id,
      member_id: memberId,
      distribution_note: `裂變推廣獎勵（活動 ${campaignId}）`,
    });
    return { granted: true, kind: "coupon", code };
  }

  // 預設 points
  const points = Math.round(value);
  const { data: row } = await admin
    .from("member_points")
    .select("id, balance, lifetime_earned")
    .eq("member_id", memberId)
    .maybeSingle();
  let balanceAfter = points;
  if (row) {
    balanceAfter = Number(row.balance || 0) + points;
    await admin
      .from("member_points")
      .update({ balance: balanceAfter, lifetime_earned: Number(row.lifetime_earned || 0) + points })
      .eq("id", row.id);
  } else {
    await admin
      .from("member_points")
      .insert({ member_id: memberId, balance: points, lifetime_earned: points });
  }
  await admin.from("member_point_transactions").insert({
    member_id: memberId,
    type: "earn_event",
    amount: points,
    balance_after: balanceAfter,
    accommodation_id: accommodationId,
    description: "社群裂變推廣獎勵",
  });
  return { granted: true, kind: "points", amount: points };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    // ---- 公開：點擊追蹤 ----
    if (action === "track_click") {
      const code = String(body?.code || "").trim();
      if (!code) return json({ error: "code required" }, 400);
      const { data: rec } = await admin
        .from("referral_records")
        .select("id, click_count, status, campaign_id")
        .eq("invite_code", code)
        .maybeSingle();
      if (!rec) return json({ error: "invalid code" }, 404);
      await admin
        .from("referral_records")
        .update({
          click_count: Number(rec.click_count || 0) + 1,
          status: rec.status === "pending" ? "clicked" : rec.status,
        })
        .eq("id", rec.id);
      return json({ success: true });
    }

    // ---- 需登入：取得/建立我的邀請連結 ----
    if (action === "get_link") {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await admin.auth.getUser(token);
      const user = userData?.user;
      if (!user) return json({ error: "Unauthorized" }, 401);

      const { data: member } = await admin
        .from("platform_members")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!member) return json({ error: "member not found" }, 404);

      const nowIso = new Date().toISOString();
      let campaignQuery = admin
        .from("referral_campaigns")
        .select("*")
        .eq("is_active", true)
        .lte("starts_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(1);
      if (body?.campaign_id) campaignQuery = admin.from("referral_campaigns").select("*").eq("id", body.campaign_id).limit(1);
      const { data: campaigns } = await campaignQuery;
      const campaign = (campaigns || []).filter(
        (c: any) => !c.ends_at || new Date(c.ends_at).getTime() >= Date.now(),
      )[0];
      if (!campaign) return json({ success: true, campaign: null, link: null });

      const { data: existing } = await admin
        .from("referral_records")
        .select("*")
        .eq("campaign_id", campaign.id)
        .eq("inviter_id", member.id)
        .is("invitee_id", null)
        .is("parent_record_id", null)
        .maybeSingle();

      let link = existing;
      if (!link) {
        const { data: created, error } = await admin
          .from("referral_records")
          .insert({
            campaign_id: campaign.id,
            inviter_id: member.id,
            invite_code: randCode(8),
            tier: 1,
            status: "pending",
          })
          .select("*")
          .single();
        if (error) return json({ error: error.message }, 400);
        link = created;
      }

      const { data: children } = await admin
        .from("referral_records")
        .select("id, status, tier, reward_type, reward_value, created_at, invitee_id")
        .eq("inviter_id", member.id)
        .not("invitee_id", "is", null);

      return json({ success: true, campaign, link, children: children || [] });
    }

    // ---- 註冊回填 ----
    if (action === "register") {
      const code = String(body?.code || "").trim();
      const memberId = String(body?.member_id || "");
      if (!code || !memberId) return json({ error: "code and member_id required" }, 400);

      const { data: linkRec } = await admin
        .from("referral_records")
        .select("*")
        .eq("invite_code", code)
        .maybeSingle();
      if (!linkRec) return json({ error: "invalid code" }, 404);
      if (linkRec.inviter_id === memberId) return json({ success: false, reason: "self_invite" });

      const { data: dup } = await admin
        .from("referral_records")
        .select("id")
        .eq("campaign_id", linkRec.campaign_id)
        .eq("invitee_id", memberId)
        .maybeSingle();
      if (dup) return json({ success: true, record_id: dup.id, duplicate: true });

      const { data: created, error } = await admin
        .from("referral_records")
        .insert({
          campaign_id: linkRec.campaign_id,
          inviter_id: linkRec.inviter_id,
          invitee_id: memberId,
          invite_code: `${code}-${randCode(6)}`,
          tier: 1,
          status: "registered",
          parent_record_id: linkRec.id,
        })
        .select("id")
        .single();
      if (error) return json({ error: error.message }, 400);

      await admin
        .from("referral_records")
        .update({ status: linkRec.status === "rewarded" ? linkRec.status : "registered" })
        .eq("id", linkRec.id);

      return json({ success: true, record_id: created.id });
    }

    // ---- 成單歸因與發獎 ----
    if (action === "qualify") {
      const memberId = String(body?.member_id || "");
      const orderId = body?.order_id ? String(body.order_id) : null;
      if (!memberId) return json({ error: "member_id required" }, 400);

      const { data: rec } = await admin
        .from("referral_records")
        .select("*")
        .eq("invitee_id", memberId)
        .in("status", ["registered", "clicked", "pending"])
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!rec) return json({ success: true, skipped: "no_pending_referral" });

      const { data: campaign } = await admin
        .from("referral_campaigns")
        .select("*")
        .eq("id", rec.campaign_id)
        .maybeSingle();
      if (!campaign) return json({ success: false, reason: "campaign_missing" });

      const results: any[] = [];

      // tier1：直接邀請人
      const t1 = pickTier(campaign.reward_tiers, 1);
      if (t1 && rec.inviter_id) {
        const r = await grantReward(admin, rec.inviter_id, t1, campaign.id, campaign.accommodation_id);
        await admin
          .from("referral_records")
          .update({
            status: r.granted ? "rewarded" : "qualified",
            invitee_order_id: orderId,
            reward_type: t1.reward_type || "points",
            reward_value: Number(t1.reward_value || 0),
            rewarded_at: r.granted ? new Date().toISOString() : null,
          })
          .eq("id", rec.id);
        results.push({ tier: 1, member_id: rec.inviter_id, ...r });
      } else {
        await admin
          .from("referral_records")
          .update({ status: "qualified", invitee_order_id: orderId })
          .eq("id", rec.id);
      }

      // tier2：邀請人的上層
      const t2 = pickTier(campaign.reward_tiers, 2);
      if (t2 && rec.inviter_id) {
        const { data: upper } = await admin
          .from("referral_records")
          .select("id, inviter_id")
          .eq("invitee_id", rec.inviter_id)
          .not("inviter_id", "is", null)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (upper?.inviter_id) {
          const r = await grantReward(admin, upper.inviter_id, t2, campaign.id, campaign.accommodation_id);
          await admin.from("referral_records").insert({
            campaign_id: campaign.id,
            inviter_id: upper.inviter_id,
            invitee_id: memberId,
            invitee_order_id: orderId,
            invite_code: `T2${randCode(8)}`,
            tier: 2,
            reward_type: t2.reward_type || "points",
            reward_value: Number(t2.reward_value || 0),
            status: r.granted ? "rewarded" : "qualified",
            parent_record_id: rec.id,
            rewarded_at: r.granted ? new Date().toISOString() : null,
          });
          results.push({ tier: 2, member_id: upper.inviter_id, ...r });
        }
      }

      return json({ success: true, results });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e: any) {
    console.error("referral-hook error", e);
    return json({ error: e?.message || "unexpected error" }, 500);
  }
});
