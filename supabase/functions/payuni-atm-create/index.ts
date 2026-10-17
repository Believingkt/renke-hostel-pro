// PAYUNi ATM 虛擬帳號幕後取號（金額、MerTradeNo、期限由後端決定）
import { buildCorsHeaders } from "../_shared/cors.ts";
import { buildPayuniTradeDeps } from "../_shared/payuniTradeDeps.ts";
import { handleAtmCreate } from "../_shared/payuniAtm.ts";

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });
  try {
    const body = await req.json().catch(() => null);
    const r = await handleAtmCreate(buildPayuniTradeDeps(), body);
    return json(r.status, r.body);
  } catch (e) {
    console.error(`[payuni-atm-create] ${e instanceof Error ? e.message : e}`);
    return json(500, { error: "取號失敗，請稍後再試" });
  }
});
