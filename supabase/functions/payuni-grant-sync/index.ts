// PAYUNi W8 撥款明細同步：action "run"（service role 或 x-internal-secret = PAYUNI_SWEEP_SECRET；或 super_admin 手動補跑）
import { buildCorsHeaders } from "../_shared/cors.ts";
import { isSuperAdmin, resolveCaller } from "../_shared/authz.ts";
import { buildPayuniTradeDeps } from "../_shared/payuniTradeDeps.ts";
import { type GrantCaller, handleGrantSync } from "../_shared/payuniGrant.ts";

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
    let caller: GrantCaller = { isService, isSuperAdmin: false, label: "system" };
    if (!isService) {
      const c = await resolveCaller(req);
      if (!c.ok) return json(c.status, { error: c.error });
      caller = { isService: false, isSuperAdmin: isSuperAdmin(c.ctx), label: String(c.ctx.userEmail ?? c.ctx.userId ?? "unknown") };
    }
    const r = await handleGrantSync(buildPayuniTradeDeps(), body, caller);
    return json(r.status, r.body);
  } catch (e) {
    console.error(`[payuni-grant-sync] ${e instanceof Error ? e.message : e}`);
    return json(500, { error: "撥款同步失敗" });
  }
});
