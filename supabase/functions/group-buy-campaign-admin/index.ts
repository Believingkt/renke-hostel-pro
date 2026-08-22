// 團購活動的安全管理端點：前置檢查 / 封存 / 解除封存 / 永久刪除
// 原則：
//  - 永久刪除只允許 super_admin
//  - 活動底下只要存在任何訂單（含已取消）一律禁止 hard delete，改用封存
//  - 絕不刪除任何 orders；檢查與刪除由 DB function 於同一 transaction 完成
// deno-lint-ignore-file no-explicit-any
import { resolveCaller, isSuperAdmin, isAccommodationAdmin, unauthorizedResponse, forbiddenResponse } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authed = await resolveCaller(req);
    if (!authed.ok) {
      return authed.status === 401
        ? unauthorizedResponse(corsHeaders, authed.error)
        : forbiddenResponse(corsHeaders, authed.error);
    }
    const ctx = authed.ctx;
    const admin = ctx.admin;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    const campaignId = String(body?.campaign_id ?? "");

    if (!UUID_RE.test(campaignId)) return json({ error: "invalid campaign_id" }, 400);
    if (!["precheck", "archive", "unarchive", "delete"].includes(action)) {
      return json({ error: "invalid action" }, 400);
    }

    const { data: campaign } = await admin
      .from("group_buy_campaigns")
      .select("id, title, accommodation_id, status, is_archived")
      .eq("id", campaignId)
      .maybeSingle();

    if (!campaign) return json({ error: "此團購活動不存在或已被刪除。" }, 404);

    const superAdmin = isSuperAdmin(ctx);
    const venueAdmin = superAdmin || (await isAccommodationAdmin(ctx, campaign.accommodation_id));
    if (!venueAdmin) return forbiddenResponse(corsHeaders, "Forbidden");

    // 永久刪除僅開放 super_admin
    if (action === "delete" && !superAdmin) {
      return json({ error: "只有最高管理員可永久刪除團購活動。請改用封存。" }, 403);
    }

    const { data: precheck, error: preErr } = await admin.rpc("group_buy_campaign_delete_precheck", {
      _campaign_id: campaignId,
    });
    if (preErr) return json({ error: preErr.message }, 400);

    const info = { ...(precheck as any), can_hard_delete: Boolean((precheck as any)?.can_hard_delete) && superAdmin };

    if (action === "precheck") return json({ ok: true, precheck: info });

    if (action === "archive" || action === "unarchive") {
      const archiving = action === "archive";
      const patch: Record<string, unknown> = archiving
        ? { is_archived: true, archived_at: new Date().toISOString(), archived_by: ctx.userId, status: "ended" }
        : { is_archived: false, archived_at: null, archived_by: null };
      const { error } = await admin.from("group_buy_campaigns").update(patch).eq("id", campaignId);
      if (error) return json({ error: error.message }, 400);

      await admin.from("audit_logs").insert([{
        user_id: ctx.userId,
        user_email: ctx.userEmail,
        action_type: archiving ? "disable" : "enable",
        action_category: "system",
        entity_type: "group_buy_campaign",
        entity_id: campaignId,
        entity_name: campaign.title,
        accommodation_id: campaign.accommodation_id,
        details: { action, precheck: info },
      }]).then(() => undefined, () => undefined);

      return json({ ok: true, archived: archiving, precheck: info });
    }

    // action === "delete"
    if (!info.can_hard_delete) {
      return json(
        { error: (info.blockers?.[0] as string) ?? "此活動不可永久刪除，請改用封存。", precheck: info },
        409,
      );
    }

    const { data: result, error: delErr } = await admin.rpc("delete_group_buy_campaign", {
      _campaign_id: campaignId,
    });
    if (delErr) return json({ error: delErr.message, precheck: info }, 409);

    await admin.from("audit_logs").insert([{
      user_id: ctx.userId,
      user_email: ctx.userEmail,
      action_type: "delete",
      action_category: "system",
      entity_type: "group_buy_campaign",
      entity_id: campaignId,
      entity_name: campaign.title,
      accommodation_id: campaign.accommodation_id,
      details: { precheck: info },
    }]).then(() => undefined, () => undefined);

    return json({ ok: true, deleted: true, result });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unknown error" }, 500);
  }
});
