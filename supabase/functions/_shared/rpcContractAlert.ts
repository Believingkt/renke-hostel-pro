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

    const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:680px;margin:0 auto;padding:24px;">
      <h2 style="color:#dc2626;margin:0 0 12px;">🚨 RPC 合約與測試快照不一致</h2>
      <p style="color:#374151;margin:0 0 8px;">${payload.summary}</p>
      <p style="color:#6b7280;font-size:13px;margin:0 0 16px;">
        若這是預期中的 migration，請重跑 scripts/dump-rpc-whitelists.ts 更新基準快照，並確認所有呼叫端送出的欄位都仍在白名單內。
      </p>
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
        subject: `🚨 [Lakeze] RPC 合約漂移 ${payload.drift.length} 支`,
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
