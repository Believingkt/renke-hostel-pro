// PAYUNi W9 人客多平台費：draft／adjust／confirm／cancel／submit／receivable／correction／confirm_correction（super_admin）、
// poll（service role 或 x-internal-secret = PAYUNI_SWEEP_SECRET，或 super_admin）、my_items（本館 hotel_admin／super_admin）
import { buildCorsHeaders } from "../_shared/cors.ts";
import { isAccommodationAdmin, isSuperAdmin, resolveCaller } from "../_shared/authz.ts";
import { buildPayuniTradeDeps } from "../_shared/payuniTradeDeps.ts";
import { type FeeCaller, handlePlatformFee } from "../_shared/payuniPlatformFee.ts";

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
    let caller: FeeCaller = { isService, isSuperAdmin: false, userId: null, label: "system", canReadAcc: () => Promise.resolve(false) };
    if (!isService) {
      const c = await resolveCaller(req);
      if (!c.ok) return json(c.status, { error: c.error });
      caller = {
        isService: false, isSuperAdmin: isSuperAdmin(c.ctx), userId: c.ctx.userId,
        label: String(c.ctx.userEmail ?? c.ctx.userId ?? "unknown"), canReadAcc: (id) => isAccommodationAdmin(c.ctx, id),
      };
    }
    const deps = { ...buildPayuniTradeDeps(), agentMerId: Deno.env.get("PAYUNI_AGENT_MER_ID") || null };
    const r = await handlePlatformFee(deps, body, caller);
    return json(r.status, r.body);
  } catch (e) {
    console.error(`[payuni-platform-fee-run] ${e instanceof Error ? e.message : e}`);
    return json(500, { error: "平台費處理失敗" });
  }
});
