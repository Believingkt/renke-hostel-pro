// 共用：OTA 同步（OwlTing / HotelNabe）部分失敗的內部技術告警信
// 收件條件：alert_recipients.is_active = true AND notify_owlting_sync_failure = true
// deno-lint-ignore-file no-explicit-any

export interface SyncFailureItem {
  order_id?: string | null;
  order_number?: string | null;
  reference?: string | null; // OBE / UniqueID / ResID
  error: string;
}

export async function reportOwltingSyncFailure(
  admin: any,
  payload: {
    functionName: string;
    category: string; // e.g. owlting_auto_cancel / owlting_cm_partial / hotelnabe_receiver
    step?: string;
    summary: string;
    reference?: string | null;
    failed: SyncFailureItem[];
    successCount?: number;
  },
): Promise<void> {
  // 1) 一律寫 error_logs（事後查得到）
  try {
    await admin.from("error_logs").insert({
      source: "backend",
      function_name: payload.functionName,
      category: payload.category,
      step: payload.step ?? null,
      error_message: payload.summary.substring(0, 2000),
      context: {
        reference: payload.reference ?? null,
        success_count: payload.successCount ?? null,
        failed: payload.failed,
      },
    });
  } catch (e) {
    console.error("[owltingSyncAlert] error_logs insert failed:", e);
  }

  // 2) 告警信（best-effort）
  try {
    const resendKey = Deno.env.get("RESEND_API_KEY_LAKEZE") ?? Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("[owltingSyncAlert] Missing RESEND_API_KEY_LAKEZE / RESEND_API_KEY");
      return;
    }

    const { data: recipients } = await admin
      .from("alert_recipients")
      .select("email")
      .eq("is_active", true)
      .eq("notify_owlting_sync_failure", true);

    const emails = (recipients ?? []).map((r: { email: string }) => r.email);
    if (emails.length === 0) {
      console.warn("[owltingSyncAlert] no recipients configured");
      return;
    }

    const rows = payload.failed.map((f) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${f.order_number ?? f.order_id ?? "—"}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${f.reference ?? payload.reference ?? "—"}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#b91c1c;font-size:12px;">${f.error}</td>
      </tr>`).join("");

    const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
      <h2 style="color:#dc2626;margin:0 0 12px;">🚨 OTA 同步部分失敗</h2>
      <p style="color:#374151;margin:0 0 8px;">${payload.summary}</p>
      <p style="color:#6b7280;font-size:13px;margin:0 0 16px;">
        來源：${payload.functionName}／${payload.category}${payload.successCount != null ? `　成功 ${payload.successCount} 筆` : ""}　失敗 ${payload.failed.length} 筆
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="background:#f3f4f6;text-align:left;">
          <th style="padding:8px;">訂單</th><th style="padding:8px;">OTA 編號</th><th style="padding:8px;">錯誤</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#6b7280;font-size:12px;margin-top:20px;">請至後台核對這幾筆訂單是否已正確取消／更新。此信由系統自動發送（內部技術告警）。</p>
    </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: "人客多系統告警 <noreply@lakeze.com>",
        to: emails,
        subject: `🚨 [Lakeze] OTA 同步失敗 ${payload.failed.length} 筆（${payload.category}）`,
        html,
      }),
    });
    if (!res.ok) {
      console.error(`[owltingSyncAlert] Resend failed [${res.status}]: ${await res.text()}`);
    }
  } catch (e) {
    console.error("[owltingSyncAlert] error:", e);
  }
}
