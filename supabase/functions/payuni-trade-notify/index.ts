// PAYUNi 交易 Notify（W3 信用卡；W4 於同一支加 ATM）。一律回 200 純文字 OK。
import { getPayuniConfig, parseNotify } from "../_shared/payuni.ts";
import { buildPayuniTradeDeps } from "../_shared/payuniTradeDeps.ts";
import { handleTradeNotify } from "../_shared/payuniTradeHandlers.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  try {
    return await handleTradeNotify(buildPayuniTradeDeps(), await parseNotify(req, { config: getPayuniConfig() }));
  } catch (e) {
    console.error(`[payuni-trade-notify] ${e instanceof Error ? e.message : e}`);
    return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
});
