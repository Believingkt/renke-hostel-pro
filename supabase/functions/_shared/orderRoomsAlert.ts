// 共用：訂單房型明細（order_rooms）重建失敗的內部技術告警信
export async function sendOrderRoomsAlertEmail(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  payload: {
    orderNumber: string | null;
    orderId: string | null;
    obeNumber: string | null;
    stagingId: string | null;
    error: string;
  },
): Promise<boolean> {
  const resendKey = Deno.env.get("RESEND_API_KEY_LAKEZE") ?? Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.error("[orderRoomsAlert] Missing RESEND_API_KEY_LAKEZE / RESEND_API_KEY");
    return false;
  }

  const { data: recipients } = await supabase
    .from("alert_recipients")
    .select("email")
    .eq("is_active", true)
    .eq("notify_order_rooms_failure", true);

  const emails = (recipients ?? []).map((r: { email: string }) => r.email);
  if (emails.length === 0) {
    console.warn("[orderRoomsAlert] no recipients configured");
    return false;
  }

  const row = (label: string, value: string | null) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;width:140px;color:#6b7280;">${label}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-family:monospace;">${value ?? "—"}</td>
    </tr>`;

  const html = `
  <div style="font-family:-apple-system,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
    <div style="display:inline-block;background:#fee2e2;color:#991b1b;font-size:13px;font-weight:700;padding:6px 10px;border-radius:4px;margin-bottom:16px;">🔴 高急迫</div>
    <h2 style="color:#111827;margin:0 0 12px;font-size:22px;">訂單 ${payload.orderNumber ?? payload.orderId ?? "未知訂單"} 的房型內容更新沒有成功寫入，訂單資料可能不完整</h2>
    <p style="color:#374151;margin:0 0 20px;line-height:1.7;"><strong>建議動作：</strong>請人工至該筆訂單確認房型明細是否正確，必要時手動修正</p>
    <div style="border-top:1px solid #d1d5db;margin:0 0 16px;padding-top:16px;color:#6b7280;font-size:13px;font-weight:700;">技術細節</div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${row("訂單編號", payload.orderNumber)}
      ${row("訂單 ID", payload.orderId)}
      ${row("OBE 編號", payload.obeNumber)}
      ${row("Staging ID", payload.stagingId)}
      ${row("錯誤訊息", payload.error)}
    </table>
    <p style="color:#6b7280;font-size:12px;margin-top:20px;">此信由系統自動發送（內部技術告警）。</p>
  </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "人客多系統告警 <noreply@lakeze.com>",
        to: emails,
        subject: `🚨 [Lakeze] 房型明細重建失敗：${payload.orderNumber ?? payload.orderId ?? "未知訂單"}`,
        html,
      }),
    });
    if (!res.ok) {
      console.error(`[orderRoomsAlert] Resend failed [${res.status}]: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[orderRoomsAlert] error:", e);
    return false;
  }
}
