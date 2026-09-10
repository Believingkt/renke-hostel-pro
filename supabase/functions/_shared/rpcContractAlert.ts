// 共用：RPC 定義／白名單與測試快照不一致（contract drift）的內部技術告警信
// 收件條件：alert_recipients.is_active = true AND notify_rpc_contract_drift = true
// deno-lint-ignore-file no-explicit-any

export interface DriftItem {
  fn: string;
  expected: string;
  actual: string;
  note: string;
}

export async function reportRpcContractDrift(
  admin: any,
  payload: { summary: string; drift: DriftItem[] },
): Promise<void> {
  // 1) 一律寫 error_logs
  try {
    await admin.from("error_logs").insert({
      source: "backend",
      function_name: "rpc-contract-check",
      category: "rpc_contract_drift",
      step: "daily_compare",
      error_message: payload.summary.substring(0, 2000),
      context: { drift: payload.drift },
    });
  } catch (e) {
    console.error("[rpcContractAlert] error_logs insert failed:", e);
  }

  // 2) 告警信（best-effort）
  try {
    const resendKey = Deno.env.get("RESEND_API_KEY_LAKEZE") ?? Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("[rpcContractAlert] Missing RESEND_API_KEY_LAKEZE / RESEND_API_KEY");
      return;
    }

    const { data: recipients } = await admin
      .from("alert_recipients")
      .select("email")
      .eq("is_active", true)
      .eq("notify_rpc_contract_drift", true);

    const emails = (recipients ?? []).map((r: { email: string }) => r.email);
    if (emails.length === 0) {
      console.warn("[rpcContractAlert] no recipients configured");
      return;
    }

    const rows = payload.drift.map((d) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-family:monospace;">${d.fn}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px;">${d.expected}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#b91c1c;">${d.actual}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px;">${d.note}</td>
      </tr>`).join("");
    const functionName = payload.drift[0]?.fn ?? "未知函式";

    const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:680px;margin:0 auto;padding:24px;">
      <div style="display:inline-block;background:#fef3c7;color:#92400e;font-size:13px;font-weight:700;padding:6px 10px;border-radius:4px;margin-bottom:16px;">🟡 中急迫</div>
      <h2 style="color:#111827;margin:0 0 12px;font-size:22px;">系統內部函式 ${functionName} 的定義被改動過，跟原本記錄的版本不一致</h2>
      <p style="color:#374151;margin:0 0 20px;line-height:1.7;"><strong>建議動作：</strong>請確認這次改動是否為已知的正常部署，若不是需要盡快查清楚是誰、為什麼修改</p>
      <div style="border-top:1px solid #d1d5db;margin:0 0 16px;padding-top:16px;color:#6b7280;font-size:13px;font-weight:700;">技術細節</div>
      <p style="color:#374151;margin:0 0 16px;">${payload.summary}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="background:#f3f4f6;text-align:left;">
          <th style="padding:8px;">RPC</th><th style="padding:8px;">快照 md5</th>
          <th style="padding:8px;">實際 md5</th><th style="padding:8px;">備註</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#6b7280;font-size:12px;margin-top:20px;">此信由系統自動發送（內部技術告警）。</p>
    </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: "人客多系統告警 <noreply@lakeze.com>",
        to: emails,
        subject: `🟡 [Lakeze] ${payload.drift.length} 支內部函式版本不一致`,
        html,
      }),
    });
    if (!res.ok) {
      console.error(`[rpcContractAlert] Resend failed [${res.status}]: ${await res.text()}`);
    }
  } catch (e) {
    console.error("[rpcContractAlert] error:", e);
  }
}
