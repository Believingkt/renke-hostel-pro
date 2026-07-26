// 共用：金流告警信（TapPay webhook 失敗、重試耗盡）
export async function sendPaymentAlertEmail(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  subject: string,
  html: string,
): Promise<boolean> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!lovableKey || !resendKey) {
    console.error("[paymentAlert] Missing LOVABLE_API_KEY or RESEND_API_KEY");
    return false;
  }

  const { data: recipients } = await supabase
    .from("alert_recipients")
    .select("email")
    .eq("is_active", true)
    .eq("notify_payment_webhook", true);

  const emails = (recipients ?? []).map((r: { email: string }) => r.email);
  if (emails.length === 0) {
    console.warn("[paymentAlert] no recipients configured");
    return false;
  }

  try {
    const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({
        from: "Lakeze 金流告警 <onboarding@resend.dev>",
        to: emails,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error(`[paymentAlert] Resend failed [${res.status}]: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[paymentAlert] error:", e);
    return false;
  }
}

export function buildPaymentAlertHtml(rows: {
  orderNumber: string | null;
  recTradeId: string | null;
  eventType: string;
  amount: number | null;
  retryCount: number;
  error: string | null;
}[]): string {
  const items = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${r.orderNumber ?? "（未比對到訂單）"}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${r.eventType}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">NT$ ${(r.amount ?? 0).toLocaleString()}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${r.retryCount}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#b91c1c;">${r.error ?? ""}</td>
      </tr>`,
    )
    .join("");

  return `
  <div style="font-family:-apple-system,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
    <h2 style="color:#dc2626;margin:0 0 12px;">🚨 TapPay 金流事件處理失敗</h2>
    <p style="color:#374151;margin:0 0 16px;">下列金流通知在自動重試後仍失敗，已標記為「待人工處理」，請至後台「金流稽核」頁核對。</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr style="background:#f3f4f6;text-align:left;">
          <th style="padding:8px;">訂單編號</th><th style="padding:8px;">事件</th>
          <th style="padding:8px;">金額</th><th style="padding:8px;">重試</th><th style="padding:8px;">錯誤</th>
        </tr>
      </thead>
      <tbody>${items}</tbody>
    </table>
    <p style="color:#6b7280;font-size:12px;margin-top:20px;">此信由系統自動發送。</p>
  </div>`;
}
