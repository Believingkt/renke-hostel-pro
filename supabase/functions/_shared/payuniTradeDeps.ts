// PAYUNi W3：正式環境的依賴組裝（DB client、PAYUNi 呼叫、付款成功副作用、告警）
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callPayuni, getPayuniConfig } from "./payuni.ts";
import { sendPaymentAlertEmail } from "./paymentAlert.ts";
import { sendBookingConfirmationByOrderId } from "./sendBookingEmail.ts";
import { pushOrderEvent } from "./push.ts";
import type { PayuniTradeDeps } from "./payuniTradeHandlers.ts";

export function buildPayuniTradeDeps(): PayuniTradeDeps {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const notifyBase = Deno.env.get("PAYUNI_NOTIFY_BASE");
  if (!url || !key) throw new Error("Supabase env not configured");
  if (!notifyBase) throw new Error("PAYUNI_NOTIFY_BASE is not configured");
  const config = getPayuniConfig();
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const post = (fn: string, body: unknown) =>
    fetch(`${url}/functions/v1/${fn}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body),
    });
  return {
    admin,
    env: config.env as "sandbox" | "production",
    notifyBase: notifyBase.replace(/\/$/, ""),
    callPayuni: (call) => callPayuni(call, { config }),
    sendAlert: (subject, html) => sendPaymentAlertEmail(admin, subject, html),
    effects: {
      sendBookingConfirmation: (orderId) => sendBookingConfirmationByOrderId(url, key, orderId, "信用卡"),
      sendFinalPaymentReceived: (orderId, paidThisTime) =>
        post("send-final-payment-received", { orderId, triggerSource: "auto_payuni", paymentMethodLabel: "信用卡(PAYUNi)", paidThisTime, paymentKind: "final" }),
      kolWebhook: (orderId) => post("kol-webhook", { order_id: orderId }),
      push: (orderId, event) => pushOrderEvent(orderId, event),
    },
  };
}
