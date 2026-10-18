// PAYUNi W7：取消退款流程的正式環境依賴（沿用 W3 交易依賴＋既有取消信、推播）
import { buildPayuniTradeDeps } from "./payuniTradeDeps.ts";
import { pushOrderEvent } from "./push.ts";
import type { CancelDeps } from "./payuniRefundHandlers.ts";

export function buildPayuniCancelDeps(): CancelDeps {
  const base = buildPayuniTradeDeps();
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return {
    admin: base.admin,
    callPayuni: base.callPayuni,
    sendAlert: base.sendAlert,
    sendCancelEmail: (body) =>
      fetch(`${url}/functions/v1/send-order-cancelled-email`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body),
      }),
    push: (orderId, event, data) => pushOrderEvent(orderId, event as any, data as any),
  };
}
