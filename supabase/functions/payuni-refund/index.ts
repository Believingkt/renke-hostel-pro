// PAYUNi W7 退款 API：status／quote／refund／resubmit_bank_account。
// 權限：後台限 super_admin 或該館 hotel_admin（總部可代填帳戶）；會員（as=member）只能看／補填自己的訂單。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { isAccommodationAdmin, resolveCaller } from "../_shared/authz.ts";
import { buildPayuniTradeDeps } from "../_shared/payuniTradeDeps.ts";
import { handlePayuniRefundApi, type RefundCaller } from "../_shared/payuniRefundHandlers.ts";

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });
  try {
    const body = await req.json().catch(() => null);
    const deps = buildPayuniTradeDeps();
    let caller: RefundCaller;
    if (body?.as === "member") {
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: u } = token ? await deps.admin.auth.getUser(token) : { data: null };
      const user = u?.user;
      if (!user) return json(401, { error: "請先登入會員" });
      const { data: member } = await deps.admin.from("platform_members").select("id, email").eq("user_id", user.id).maybeSingle();
      const email = String(user.email || member?.email || "").toLowerCase();
      caller = {
        role: "member", label: email,
        canAccess: (o) => Promise.resolve(!!((member?.id && o.member_id === member.id) || (email && String(o.guest_email ?? "").toLowerCase() === email))),
      };
    } else {
      const c = await resolveCaller(req);
      if (!c.ok) return json(c.status, { error: c.error });
      caller = {
        role: "admin", label: `PAYUNi 退款（操作者 ${c.ctx.userEmail ?? c.ctx.userId ?? "system"}）`,
        canAccess: (o) => isAccommodationAdmin(c.ctx, o.accommodation_id),
      };
    }
    const r = await handlePayuniRefundApi(deps, body, caller);
    return json(r.status, r.body);
  } catch (e) {
    console.error(`[payuni-refund] ${e instanceof Error ? e.message : e}`);
    return json(500, { error: "退款處理失敗" });
  }
});
