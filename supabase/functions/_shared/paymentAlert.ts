// 共用：金流告警信（TapPay webhook 失敗、重試耗盡）
export async function sendPaymentAlertEmail(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  subject: string,
  html: string,
): Promise<boolean> {
  const resendKey = Deno.env.get("RESEND_API_KEY_LAKEZE") ?? Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.error("[paymentAlert] Missing RESEND_API_KEY_LAKEZE / RESEND_API_KEY");
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
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "人客多金流告警 <noreply@lakeze.com>",
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
  const primaryOrder = rows[0]?.orderNumber ?? "（未比對到訂單）";

  return `
  <div style="font-family:-apple-system,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
    <div style="display:inline-block;background:#fee2e2;color:#991b1b;font-size:13px;font-weight:700;padding:6px 10px;border-radius:4px;margin-bottom:16px;">🔴 高急迫</div>
    <h2 style="color:#111827;margin:0 0 12px;font-size:22px;">金流服務商通知付款/退款狀態時失敗，訂單 ${primaryOrder} 的金流狀態可能還沒同步進系統</h2>
    <p style="color:#374151;margin:0 0 20px;line-height:1.7;"><strong>建議動作：</strong>請儘快查看該筆訂單的付款狀態是否正確，必要時人工核對金流商後台</p>
    <div style="border-top:1px solid #d1d5db;margin:0 0 16px;padding-top:16px;color:#6b7280;font-size:13px;font-weight:700;">技術細節</div>
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
