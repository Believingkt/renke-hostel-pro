// PAYUNi 信用卡幕後授權（merchant_trade）；Token 取自交易列，金額不收前端值
import { buildCorsHeaders } from "../_shared/cors.ts";
import { buildPayuniTradeDeps } from "../_shared/payuniTradeDeps.ts";
import { handleCardCharge } from "../_shared/payuniTradeHandlers.ts";

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });
  try {
    const body = await req.json().catch(() => null);
    const r = await handleCardCharge(buildPayuniTradeDeps(), body, req.headers.get("x-forwarded-for"));
    return json(r.status, r.body);
  } catch (e) {
    console.error(`[payuni-card-charge] ${e instanceof Error ? e.message : e}`);
    return json(500, { error: "付款處理失敗" });
  }
});
