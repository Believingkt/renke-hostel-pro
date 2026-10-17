// PAYUNi 交易查詢：手動（super_admin／該館 hotel_admin）或排程 sweep（service role 或 x-internal-secret = PAYUNI_SWEEP_SECRET）
import { buildCorsHeaders } from "../_shared/cors.ts";
import { isAccommodationAdmin, isSuperAdmin, resolveCaller } from "../_shared/authz.ts";
import { buildPayuniTradeDeps } from "../_shared/payuniTradeDeps.ts";
import { handleTradeQuery } from "../_shared/payuniTradeHandlers.ts";

const safeEq = (a: string, b: string) => {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });
  try {
    const body = await req.json().catch(() => null);
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const isService = safeEq(bearer, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "") ||
      safeEq(req.headers.get("x-internal-secret") ?? "", Deno.env.get("PAYUNI_SWEEP_SECRET") ?? "");
    let caller = { isService, isSuperAdmin: false, isAccommodationAdmin: (_id: string) => Promise.resolve(false) };
    if (!isService && body?.action !== "status") {
      const c = await resolveCaller(req);
      if (!c.ok) return json(c.status, { error: c.error });
      caller = { isService: false, isSuperAdmin: isSuperAdmin(c.ctx), isAccommodationAdmin: (id) => isAccommodationAdmin(c.ctx, id) };
    }
    const r = await handleTradeQuery(buildPayuniTradeDeps(), body, caller);
    return json(r.status, r.body);
  } catch (e) {
    console.error(`[payuni-trade-query] ${e instanceof Error ? e.message : e}`);
    return json(500, { error: "查詢處理失敗" });
  }
});
