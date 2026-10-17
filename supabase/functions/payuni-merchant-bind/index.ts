// PAYUNi 建立合作商店（bind_merchant）；僅 super_admin。verify_jwt=false，自行以 resolveCaller 驗身分。
import { buildCorsHeaders } from "../_shared/cors.ts";
import { isAccommodationAdmin, isSuperAdmin, resolveCaller } from "../_shared/authz.ts";
import { callPayuni, getPayuniConfig } from "../_shared/payuni.ts";
import { handleBind } from "../_shared/payuniMerchantHandlers.ts";

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });

  const caller = await resolveCaller(req);
  if (!caller.ok) return json(caller.status, { error: caller.error });
  if (!isSuperAdmin(caller.ctx)) return json(403, { error: "Forbidden" });

  let config;
  try {
    config = getPayuniConfig();
  } catch (e) {
    console.error(`[payuni-merchant-bind] config: ${e instanceof Error ? e.message : e}`);
    return json(500, { error: "PAYUNi 尚未設定" });
  }

  try {
    const body = await req.json().catch(() => null);
    const ctx = caller.ctx;
    const r = await handleBind({
      admin: ctx.admin,
      userId: ctx.userId,
      isSuperAdmin: true,
      isAccommodationAdmin: (id) => isAccommodationAdmin(ctx, id),
      agentId: config.agentId,
      callPayuni: (call) => callPayuni(call, { config }),
    }, body);
    return json(r.status, r.body);
  } catch (e) {
    console.error(`[payuni-merchant-bind] ${e instanceof Error ? e.message : e}`);
    return json(500, { error: "建店處理失敗" });
  }
});
