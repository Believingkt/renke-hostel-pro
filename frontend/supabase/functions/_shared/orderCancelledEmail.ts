// 官網（非團購）訂單取消通知信：組信與寄送的共用邏輯。
// 由 send-order-cancelled-email（HTTP 入口）與 cancel-expired-atm-orders（cron，官網分支）共用。
// cancelKind：
//   guest_request（預設）＝ 客人／後台主動取消，文案與退款區塊維持既有版本，逐字不變。
//   atm_expired      ＝ ATM 虛擬帳號付款期限逾期，系統自動取消，不顯示退款區塊。

export type CancelKind = "guest_request" | "atm_expired";

export interface CancelEmailOrder {
  id?: string;
  order_number: string;
  guest_name?: string | null;
  guest_email?: string | null;
  check_in_date?: string | null;
  check_out_date?: string | null;
  final_price?: number | null;
}

export interface BuildCancelEmailInput {
  order: CancelEmailOrder;
  roomName?: string;
  accName?: string;
  accPhone?: string;
  accEmail?: string;
  chargedFee?: number;
  refunded?: number;
  needManual?: boolean;
  reason?: string | null;
  cancelKind?: CancelKind;
  deadlineText?: string | null;
}

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function buildCancelEmail(input: BuildCancelEmailInput): { subject: string; html: string } {
  const {
    order,
    roomName = "",
    accName = "",
    accPhone = "",
    accEmail = "",
    reason = null,
    deadlineText = null,
  } = input;
  const kind: CancelKind = input.cancelKind ?? "guest_request";
  const fee = Number(input.chargedFee || 0);
  const refunded = Number(input.refunded || 0);
  const needManual = Boolean(input.needManual);

  const subject = `${accName ? `【${accName}】` : ""}訂單已取消 - 訂單編號 ${order.order_number}`;

  const introLine =
    kind === "atm_expired"
      ? `<p>您的訂單因未於付款期限內完成 ATM 匯款，系統已自動取消：</p>`
      : `<p>我們已依您的要求取消以下訂單：</p>`;

  const resultBlock =
    kind === "atm_expired"
      ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;">
        <p style="margin:0 0 8px 0;font-weight:700;color:#b91c1c;">取消原因</p>
        <p style="margin:4px 0;font-size:15px;">ATM 虛擬帳號付款期限已逾期，系統自動取消此訂單。</p>
        ${deadlineText ? `<p style="margin:4px 0;font-size:15px;">原付款期限：<strong>${esc(deadlineText)}</strong></p>` : ""}
        <p style="margin:10px 0 0 0;font-size:14px;color:#b91c1c;">此訂單已失效，請勿再匯款至原虛擬帳號；如仍需訂房，請重新下訂。</p>
      </div>`
      : `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;">
        <p style="margin:0 0 8px 0;font-weight:700;color:#b91c1c;">取消結果</p>
        <p style="margin:4px 0;font-size:15px;">取消手續費：<strong>NT$ ${fee.toLocaleString()}</strong></p>
        <p style="margin:4px 0;font-size:15px;">退款金額：<strong>NT$ ${refunded.toLocaleString()}</strong></p>
        ${needManual ? `<p style="margin:10px 0 0 0;font-size:14px;color:#b91c1c;">部分款項需由客服人員人工處理，我們將盡快與您聯繫。</p>` : ""}
        ${refunded > 0 ? `<p style="margin:10px 0 0 0;font-size:13px;color:#666;">退款將由原付款管道退回，實際入帳時間依發卡銀行作業為準（約 3～10 個工作天）。</p>` : ""}
      </div>`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Microsoft JhengHei',Arial,sans-serif;color:#333;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:linear-gradient(135deg,#dc2626 0%,#ef4444 100%);color:#fff;padding:30px;text-align:center;border-radius:10px 10px 0 0;">
      <h1 style="margin:0;font-size:26px;">訂單已取消</h1>
      ${accName ? `<p style="margin:10px 0 0 0;font-size:16px;opacity:.95;">${esc(accName)}</p>` : ""}
    </div>
    <div style="background:#fff;padding:30px;border:1px solid #e0e0e0;">
      <p style="font-size:16px;">親愛的 ${esc(order.guest_name)} 您好，</p>
      ${introLine}
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="color:#666;padding:12px 0;">訂單編號</td><td style="text-align:right;font-weight:600;padding:12px 0;">${esc(order.order_number)}</td></tr>
        ${roomName ? `<tr style="border-bottom:1px solid #f0f0f0;"><td style="color:#666;padding:12px 0;">房型</td><td style="text-align:right;font-weight:600;padding:12px 0;">${esc(roomName)}</td></tr>` : ""}
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="color:#666;padding:12px 0;">原訂日期</td><td style="text-align:right;font-weight:600;padding:12px 0;">${esc(order.check_in_date)} → ${esc(order.check_out_date)}</td></tr>
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="color:#666;padding:12px 0;">訂單總額</td><td style="text-align:right;font-weight:600;padding:12px 0;">NT$ ${Number(order.final_price || 0).toLocaleString()}</td></tr>
      </table>

      ${resultBlock}

      ${reason ? `<p style="margin-top:20px;color:#666;font-size:14px;">取消原因：${esc(reason)}</p>` : ""}

      ${(accPhone || accEmail) ? `
      <div style="margin-top:24px;padding:20px;background:#f8f9fa;border-radius:8px;border-left:4px solid #dc2626;">
        <p style="margin:0 0 12px 0;font-weight:600;">如有任何疑問，歡迎聯繫${accName ? ` ${esc(accName)}` : ""}：</p>
        ${accPhone ? `<p style="margin:6px 0;color:#666;">📞 ${esc(accPhone)}</p>` : ""}
        ${accEmail ? `<p style="margin:6px 0;color:#666;">📧 ${esc(accEmail)}</p>` : ""}
      </div>` : ""}

      <p style="margin-top:20px;color:#666;">期待未來有機會為您服務。</p>
    </div>
    <div style="background:#f8f9fa;padding:20px;text-align:center;color:#666;border-radius:0 0 10px 10px;">
      <p style="margin:0;font-size:14px;">此為系統自動發送的郵件，請勿直接回覆</p>
    </div>
  </div>
</body></html>`;

  return { subject, html };
}

export interface SendCancelEmailParams {
  orderId?: string;
  orderNumber?: string;
  reason?: string | null;
  chargedFee?: number;
  refunded?: number;
  needManual?: boolean;
  triggerSource?: string;
  cancelKind?: CancelKind;
  deadlineText?: string | null;
  /** 有值時：只寄到此測試信箱，且完全不寫 booking_email_log。 */
  previewTo?: string;
}

export type SendCancelEmailResult =
  | { ok: true; skipped?: "no_email"; subject?: string; html?: string }
  | { ok: false; status: number; error: string };

// deno-lint-ignore no-explicit-any
export async function sendOrderCancelledEmail(
  supabase: any,
  params: SendCancelEmailParams,
): Promise<SendCancelEmailResult> {
  const resendKey = Deno.env.get("RESEND_API_KEY_LAKEZE") ?? Deno.env.get("RESEND_API_KEY");

  if (!params.orderId && !params.orderNumber) {
    return { ok: false, status: 400, error: "order required" };
  }

  let q = supabase
    .from("orders")
    .select(
      "id, order_number, guest_name, guest_email, accommodation_id, check_in_date, check_out_date, guest_count, final_price, paid_amount, room_types(name)",
    );
  q = params.orderId ? q.eq("id", params.orderId) : q.eq("order_number", params.orderNumber!);
  const { data: order } = await q.maybeSingle();

  if (!order) return { ok: false, status: 404, error: "order_not_found" };
  if (!order.guest_email) return { ok: true, skipped: "no_email" };

  let accName = "";
  let accPhone = "";
  let accEmail = "";
  if (order.accommodation_id) {
    const { data: acc } = await supabase
      .from("accommodation_info")
      .select("name, phone, email")
      .eq("id", order.accommodation_id)
      .maybeSingle();
    accName = acc?.name ?? "";
    accPhone = acc?.phone ?? "";
    accEmail = acc?.email ?? "";
  }

  const { subject, html } = buildCancelEmail({
    order,
    roomName: order.room_types?.name ?? "",
    accName,
    accPhone,
    accEmail,
    chargedFee: params.chargedFee,
    refunded: params.refunded,
    needManual: params.needManual,
    reason: params.reason ?? null,
    cancelKind: params.cancelKind,
    deadlineText: params.deadlineText ?? null,
  });

  if (!resendKey) return { ok: false, status: 500, error: "email_not_configured" };

  const previewTo = params.previewTo?.trim() || "";
  const recipient = previewTo || order.guest_email;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "人客多通知 <noreply@lakeze.com>",
      to: [recipient],
      subject,
      html,
    }),
  });
  const text = await resp.text();

  if (!previewTo) {
    try {
      await supabase.from("booking_email_log").insert({
        order_id: order.id,
        order_number: order.order_number,
        email_type: "order_cancelled",
        recipient: order.guest_email,
        subject,
        status: resp.ok ? "sent" : "failed",
        error_message: resp.ok ? null : text.slice(0, 1000),
        trigger_source: params.triggerSource || "member_cancel",
      });
    } catch (logErr) {
      console.error("[orderCancelledEmail] log failed", logErr);
    }
  }

  if (!resp.ok) {
    console.error("[orderCancelledEmail] resend failed", resp.status, text);
    return { ok: false, status: 502, error: text };
  }

  return { ok: true, subject, html };
}
