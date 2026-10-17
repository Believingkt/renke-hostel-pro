// PAYUNi 商店狀態查詢與管理：query（super_admin 或該館 hotel_admin）、update_contact / set_provider / list_reasons（super_admin）。
import { buildCorsHeaders } from "../_shared/cors.ts";
import { isAccommodationAdmin, isSuperAdmin, resolveCaller } from "../_shared/authz.ts";
import { callPayuni, getPayuniConfig, type PayuniConfig } from "../_shared/payuni.ts";
import { handleStatus } from "../_shared/payuniMerchantHandlers.ts";

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });

  const caller = await resolveCaller(req);
  if (!caller.ok) return json(caller.status, { error: caller.error });
  const ctx = caller.ctx;

  // set_provider / list_reasons 不呼叫 PAYUNi，金鑰未設定時仍可使用
  let config: PayuniConfig | null = null;
  try {
    config = getPayuniConfig();
  } catch (e) {
    console.error(`[payuni-merchant-status] config: ${e instanceof Error ? e.message : e}`);
  }

  try {
    const body = await req.json().catch(() => null);
    const r = await handleStatus({
      admin: ctx.admin,
      userId: ctx.userId,
      isSuperAdmin: isSuperAdmin(ctx),
      isAccommodationAdmin: (id) => isAccommodationAdmin(ctx, id),
      agentId: config?.agentId ?? "",
      callPayuni: (call) => {
        if (!config) throw new Error("PAYUNi 尚未設定");
        return callPayuni(call, { config });
      },
    }, body);
    return json(r.status, r.body);
  } catch (e) {
    console.error(`[payuni-merchant-status] ${e instanceof Error ? e.message : e}`);
    return json(500, { error: "查詢處理失敗" });
  }
});
