// 供其他 edge function 呼叫的推播小工具（best-effort，不阻斷主流程）
export type PushEvent =
  | "order_created"
  | "payment_success"
  | "order_cancelled"
  | "checkin_reminder";

export async function pushOrderEvent(
  orderId: string,
  event: PushEvent,
  extra: { amount?: number } = {},
): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key || !orderId) return;
    await fetch(`${url}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ orderId, event, ...extra }),
    });
  } catch (e) {
    console.error("[pushOrderEvent] failed", event, e);
  }
}
