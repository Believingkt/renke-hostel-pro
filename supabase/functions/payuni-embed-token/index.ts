// PAYUNi 信用卡 UNi Embed：建立交易列並取 SDK Token（金額、MerTradeNo 由後端決定）
import { buildCorsHeaders } from "../_shared/cors.ts";
import { buildPayuniTradeDeps } from "../_shared/payuniTradeDeps.ts";
import { handleEmbedToken } from "../_shared/payuniTradeHandlers.ts";

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method Not Allowed" });
  try {
    const body = await req.json().catch(() => null);
    const r = await handleEmbedToken(buildPayuniTradeDeps(), body, req.headers.get("origin"));
    return json(r.status, r.body);
  } catch (e) {
    console.error(`[payuni-embed-token] ${e instanceof Error ? e.message : e}`);
    return json(500, { error: "付款元件初始化失敗" });
  }
});
