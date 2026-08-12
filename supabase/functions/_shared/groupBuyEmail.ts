// 團購訂單三種通知信（訂房＋匯款資訊 / 已收到訂金 / 逾期取消）
// 走既有 Resend connector gateway，版型沿用品牌橘色調。

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "人客多 Lakeze <noreply@sensaninn.lakeze.com>";
const LOGO_URL =
  "https://dmafqwfynatdvnaeovhz.supabase.co/storage/v1/object/public/email-assets/lakeze-logo.png";

const BRAND = {
  primary: "#d07218",
  primaryLight: "#fdf0e3",
  accent: "#d47a0a",
  foreground: "#2d3344",
  muted: "#6b7280",
};

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(title: string, preview: string, body: string): string {
  return `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title>
<style>
body{margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;}
.container{max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;}
.header{background:linear-gradient(135deg,${BRAND.primary},${BRAND.accent});padding:28px 24px;text-align:center;}
.header img{height:44px;}
.body{padding:28px 26px;}
.body h1{color:${BRAND.foreground};font-size:21px;margin:0 0 14px;}
.body p{color:${BRAND.muted};font-size:15px;line-height:1.7;margin:0 0 16px;}
table.info{width:100%;border-collapse:collapse;margin:0 0 18px;}
table.info td{padding:8px 0;font-size:14px;color:${BRAND.foreground};border-bottom:1px solid #f0f0f0;}
table.info td.k{color:${BRAND.muted};width:38%;}
.box{background:${BRAND.primaryLight};border:1px solid ${BRAND.primary}33;border-radius:8px;padding:16px;margin:0 0 18px;}
.box h2{margin:0 0 10px;font-size:15px;color:${BRAND.foreground};}
.btn{display:inline-block;background:${BRAND.primary};color:#fff !important;text-decoration:none;padding:13px 30px;border-radius:8px;font-size:15px;font-weight:600;}
.footer{background:#fafafa;padding:18px 26px;text-align:center;border-top:1px solid #eee;}
.footer p{color:#999;font-size:12px;margin:0;}
</style></head><body>
<div style="display:none;max-height:0;overflow:hidden">${esc(preview)}</div>
<div style="padding:24px 16px;"><div class="container">
<div class="header"><img src="${LOGO_URL}" alt="人客多 Lakeze" /></div>
<div class="body">${body}</div>
<div class="footer"><p>© ${new Date().getFullYear()} 人客多 Lakeze. All rights reserved.</p></div>
</div></div></body></html>`;
}

export interface GroupBuyEmailOrder {
  orderNumber: string;
  guestName: string;
  campaignTitle: string;
  accommodationName?: string | null;
  packageName?: string | null;
  checkInDate: string;
  checkOutDate: string;
  guestCount?: number | null;
  totalPrice: number;
  depositAmount: number;
  balanceAmount: number;
  deadlineText?: string | null;
  orderUrl?: string | null;
}

export interface GroupBuyBankInfo {
  bankName: string;
  bankCode?: string | null;
  branchName?: string | null;
  accountName: string;
  accountNumber: string;
  note?: string | null;
}

function money(n: number): string {
  return `NT$ ${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
}

function orderTable(o: GroupBuyEmailOrder): string {
  return `<table class="info">
    <tr><td class="k">訂單編號</td><td><strong>${esc(o.orderNumber)}</strong></td></tr>
    <tr><td class="k">團購活動</td><td>${esc(o.campaignTitle)}</td></tr>
    ${o.accommodationName ? `<tr><td class="k">住宿</td><td>${esc(o.accommodationName)}</td></tr>` : ""}
    ${o.packageName ? `<tr><td class="k">方案</td><td>${esc(o.packageName)}</td></tr>` : ""}
    <tr><td class="k">入住 / 退房</td><td>${esc(o.checkInDate)} → ${esc(o.checkOutDate)}</td></tr>
    ${o.guestCount ? `<tr><td class="k">入住人數</td><td>${esc(o.guestCount)} 人</td></tr>` : ""}
    <tr><td class="k">訂單總額</td><td>${money(o.totalPrice)}</td></tr>
    <tr><td class="k">應付訂金</td><td><strong style="color:${BRAND.primary}">${money(o.depositAmount)}</strong></td></tr>
    <tr><td class="k">入住現場付清</td><td>${money(o.balanceAmount)}</td></tr>
  </table>`;
}

export function renderBookingWithBankInfo(
  o: GroupBuyEmailOrder,
  bank: GroupBuyBankInfo | null,
): { subject: string; html: string } {
  const bankBlock = bank
    ? `<div class="box"><h2>匯款資訊</h2>
      <table class="info" style="margin:0">
        <tr><td class="k">銀行</td><td>${esc(bank.bankName)}${bank.bankCode ? `（${esc(bank.bankCode)}）` : ""}</td></tr>
        ${bank.branchName ? `<tr><td class="k">分行</td><td>${esc(bank.branchName)}</td></tr>` : ""}
        <tr><td class="k">戶名</td><td>${esc(bank.accountName)}</td></tr>
        <tr><td class="k">帳號</td><td><strong>${esc(bank.accountNumber)}</strong></td></tr>
        ${bank.note ? `<tr><td class="k">備註</td><td>${esc(bank.note)}</td></tr>` : ""}
      </table></div>`
    : `<p>匯款資訊將由客服另行提供，請留意通知。</p>`;

  return {
    subject: `【訂房成立・待匯款】${o.campaignTitle} 訂單 ${o.orderNumber}`,
    html: layout(
      "訂房成立，請完成匯款",
      `訂單 ${o.orderNumber} 已成立，請於期限內完成訂金匯款`,
      `<h1>訂房已成立，請完成訂金匯款 🎉</h1>
       <p>${esc(o.guestName)} 您好，感謝您參加團購。以下是您的訂單資訊，請於期限內完成訂金匯款以保留房間。</p>
       ${orderTable(o)}
       ${bankBlock}
       ${o.deadlineText ? `<p><strong style="color:${BRAND.primary}">匯款期限：${esc(o.deadlineText)}</strong>（逾期系統將自動取消訂單）</p>` : ""}
       <p>匯款完成後，請至訂單查詢頁點選「我已完成匯款」，我們會盡快為您核對入帳。</p>
       ${o.orderUrl ? `<p style="text-align:center"><a class="btn" href="${esc(o.orderUrl)}">查詢我的訂單</a></p>` : ""}`,
    ),
  };
}

export function renderDepositReceived(o: GroupBuyEmailOrder): { subject: string; html: string } {
  return {
    subject: `【已收到訂金】${o.campaignTitle} 訂單 ${o.orderNumber}`,
    html: layout(
      "已收到您的訂金",
      `訂單 ${o.orderNumber} 訂金已入帳`,
      `<h1>已收到您的訂金 ✅</h1>
       <p>${esc(o.guestName)} 您好，我們已確認收到您的訂金 <strong>${money(o.depositAmount)}</strong>，您的訂房已完成確認。</p>
       ${orderTable(o)}
       <p>尾款 ${money(o.balanceAmount)} 請於入住當天現場付清。期待與您相見！</p>
       ${o.orderUrl ? `<p style="text-align:center"><a class="btn" href="${esc(o.orderUrl)}">查詢我的訂單</a></p>` : ""}`,
    ),
  };
}

export function renderExpiredCancelled(o: GroupBuyEmailOrder): { subject: string; html: string } {
  return {
    subject: `【訂單已取消】${o.campaignTitle} 訂單 ${o.orderNumber}`,
    html: layout(
      "訂單已因逾期取消",
      `訂單 ${o.orderNumber} 因逾期未匯款已取消`,
      `<h1>訂單已因逾期未匯款取消</h1>
       <p>${esc(o.guestName)} 您好，您的訂單 <strong>${esc(o.orderNumber)}</strong> 因未於期限內完成訂金匯款，系統已自動取消並釋出房間。</p>
       ${orderTable(o)}
       <p>若您已完成匯款或仍希望入住，請直接與我們聯繫，我們會協助您處理。</p>`,
    ),
  };
}

/** 實際送出（缺 key 或缺信箱時安靜跳過，不影響主流程） */
export async function sendGroupBuyEmail(
  to: string | null | undefined,
  mail: { subject: string; html: string },
): Promise<{ ok: boolean; reason?: string }> {
  if (!to) return { ok: false, reason: "no_email" };
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY_1");
  if (!lovableKey || !resendKey) return { ok: false, reason: "email_not_configured" };

  try {
    const resp = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject: mail.subject, html: mail.html }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error("[groupBuyEmail] resend failed", resp.status, text.slice(0, 300));
      return { ok: false, reason: `http_${resp.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[groupBuyEmail] send threw", e);
    return { ok: false, reason: "exception" };
  }
}
