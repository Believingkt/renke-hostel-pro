// 團購訂單三種通知信（訂房＋匯款資訊 / 已收到訂金 / 逾期取消）
// 走既有 Resend connector gateway，版型沿用品牌橘色調。

import { refundScheduleHtml } from "./refundPolicy.ts";
import { manualRefundRequestHtml, type VenueContact } from "./manualRefundRequest.ts";
import { cancellationPolicyCopy, renderCancellationPolicyHtml } from "./cancellationPolicyCopy.ts";
import type { CancellationPolicyType } from "./cancellationPolicy.ts";


const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "人客多通知 <noreply@lakeze.com>";
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
  /** 依訂單實際付款制度判定之取消政策（顯示用，與後端計算同源） */
  cancellationPolicy?: CancellationPolicyType | null;

  /* ── 明細補充欄位（選填；不帶時版型與既有信件完全相同） ── */
  /** 住宿晚數 */
  nights?: number | null;
  /** 訂購間數 */
  roomQuantity?: number | null;
  /** 房型名稱 */
  roomTypeName?: string | null;
  /** 人數組成文字（成人 X　兒童 Y…） */
  guestCompositionText?: string | null;
  /** 訂房人聯絡電話 */
  contactPhone?: string | null;
  /** 訂房人 Email */
  contactEmail?: string | null;
  /** 實際已付金額 */
  paidAmount?: number | null;
  /** 原付款方式顯示文字（SoT = orders.payment_method，provider 僅 fallback） */
  paymentMethodText?: string | null;
  /** 退款管道顯示文字（與原付款方式分開，不可反向覆蓋） */
  refundChannelText?: string | null;
  /** 民宿地址 */
  venueAddress?: string | null;
  /** 民宿聯絡電話 */
  venuePhone?: string | null;
  /** 入住須知／入住前提醒 */
  arrivalNotice?: string | null;

  /* ── 付款方式分流（Email 顯示 SoT，由 buildEmailOrder 依 orders 真實欄位計算） ── */
  /** 是否為 TapPay 信用卡收款訂單（與 server isCardPaidOrder 同一份規則） */
  isCardOrder?: boolean;
  /** 是否一次全額預收（信用卡全額付款）→ 不得顯示應付訂金／尾款 */
  fullPrepayment?: boolean;
}


/** 取消政策區塊（與一般訂房信共用同一份文案來源） */
function cancellationBlock(o: GroupBuyEmailOrder): string {
  if (!o.cancellationPolicy) return "";
  return `<div class="box">${
    renderCancellationPolicyHtml(cancellationPolicyCopy(o.cancellationPolicy))
  }</div>`;
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

function orderTable(
  o: GroupBuyEmailOrder,
  fullPaymentArg = false,
  opts: { hideDue?: boolean } = {},
): string {
  // 信用卡全額預收訂單一律走全額版型（不得出現應付訂金／入住現場付清）
  const fullPayment = fullPaymentArg || o.fullPrepayment === true;
  const paid = Number(o.paidAmount ?? 0);
  const due = fullPayment ? 0 : Math.max(0, Math.round(Number(o.totalPrice) - paid));

  return `<table class="info">
    <tr><td class="k">訂單編號</td><td><strong>${esc(o.orderNumber)}</strong></td></tr>
    <tr><td class="k">團購活動</td><td>${esc(o.campaignTitle)}</td></tr>
    ${o.accommodationName ? `<tr><td class="k">住宿</td><td>${esc(o.accommodationName)}</td></tr>` : ""}
    ${o.packageName ? `<tr><td class="k">方案</td><td>${esc(o.packageName)}</td></tr>` : ""}
    ${o.roomTypeName ? `<tr><td class="k">房型</td><td>${esc(o.roomTypeName)}</td></tr>` : ""}
    <tr><td class="k">入住 / 退房</td><td>${esc(o.checkInDate)} → ${esc(o.checkOutDate)}</td></tr>
    ${o.nights ? `<tr><td class="k">住宿晚數</td><td>${esc(o.nights)} 晚${o.roomQuantity ? ` × ${esc(o.roomQuantity)} 棟` : ""}</td></tr>` : ""}
    ${
    o.guestCompositionText
      ? `<tr><td class="k">入住人數</td><td>${esc(o.guestCompositionText)}</td></tr>`
      : o.guestCount
      ? `<tr><td class="k">入住人數</td><td>${esc(o.guestCount)} 人</td></tr>`
      : ""
  }
    <tr><td class="k">訂房人</td><td>${esc(o.guestName)}</td></tr>
    ${o.contactPhone ? `<tr><td class="k">聯絡電話</td><td>${esc(o.contactPhone)}</td></tr>` : ""}
    ${o.contactEmail ? `<tr><td class="k">Email</td><td>${esc(o.contactEmail)}</td></tr>` : ""}
    <tr><td class="k">訂單總額</td><td>${money(o.totalPrice)}</td></tr>
    ${
    fullPayment
      ? `<tr><td class="k">已付款金額</td><td><strong style="color:${BRAND.primary}">${
        money(paid || o.totalPrice)
      }</strong></td></tr>${
        opts.hideDue
          ? ""
          : `
    <tr><td class="k">尚需支付</td><td>${money(0)}</td></tr>
    <tr><td class="k">付款狀態</td><td><strong style="color:${BRAND.primary}">已全額付清</strong></td></tr>`
      }`
      : `<tr><td class="k">應付訂金</td><td><strong style="color:${BRAND.primary}">${money(o.depositAmount)}</strong></td></tr>
    <tr><td class="k">入住現場付清</td><td>${money(o.balanceAmount || due)}</td></tr>`
  }

    ${o.paymentMethodText ? `<tr><td class="k">付款方式</td><td>${esc(o.paymentMethodText)}</td></tr>` : ""}
  </table>`;
}

/** 民宿聯絡資訊 + 入住須知（有資料才輸出） */
function venueContactBlock(o: GroupBuyEmailOrder): string {
  const rows = [
    o.accommodationName ? `<tr><td class="k">住宿名稱</td><td>${esc(o.accommodationName)}</td></tr>` : "",
    o.venueAddress ? `<tr><td class="k">地址</td><td>${esc(o.venueAddress)}</td></tr>` : "",
    o.venuePhone ? `<tr><td class="k">聯絡電話</td><td>${esc(o.venuePhone)}</td></tr>` : "",
  ].filter(Boolean).join("");
  const notice = o.arrivalNotice && o.arrivalNotice.trim() !== ""
    ? `<p style="white-space:pre-line;margin:10px 0 0">${esc(o.arrivalNotice)}</p>`
    : "";
  if (!rows && !notice) return "";
  return `<div class="box"><h2>入住資訊</h2>${
    rows ? `<table class="info" style="margin:0">${rows}</table>` : ""
  }${notice}</div>`;
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
       ${cancellationBlock(o)}
       ${bankBlock}
       ${o.deadlineText ? `<p><strong style="color:${BRAND.primary}">匯款期限：${esc(o.deadlineText)}</strong>（逾期系統將自動取消訂單）</p>` : ""}
       <p>匯款完成後，請至訂單查詢頁點選「我已完成匯款」，我們會盡快為您核對入帳。</p>
       ${o.orderUrl ? `<p style="text-align:center"><a class="btn" href="${esc(o.orderUrl)}">匯款回報 / 查詢訂單</a></p>` : ""}`,

    ),
  };
}

/**
 * 已收到訂金通知。
 * opts 為選填：不帶時行為與既有人工匯款流程完全相同（不可變更）。
 * 帶入時可標示收款方式（例如 ATM 虛擬帳號轉帳）與本次實收金額。
 */
export function renderDepositReceived(
  o: GroupBuyEmailOrder,
  opts?: { providerLabel?: string | null; paidThisTime?: number | null; fullPayment?: boolean },
): { subject: string; html: string } {
  const full = opts?.fullPayment === true;
  const providerLine = opts?.providerLabel
    ? `<p>收款方式：<strong>${esc(opts.providerLabel)}</strong>${
      typeof opts.paidThisTime === "number" ? `，本次收款 <strong>${money(opts.paidThisTime)}</strong>` : ""
    }</p>`
    : "";
  return {
    subject: full
      ? `【訂房確認・已完成付款】${o.campaignTitle} 訂單 ${o.orderNumber}`
      : `【訂房確認・已收到訂金】${o.campaignTitle} 訂單 ${o.orderNumber}`,
    html: layout(
      full ? "訂房確認・已完成付款" : "訂房確認・已收到訂金",
      full ? `訂單 ${o.orderNumber} 訂房確認且已全額付清` : `訂單 ${o.orderNumber} 訂金已入帳，訂房完成`,
      `<h1>${full ? "訂房確認．已完成付款 ✅" : "訂房確認．已收到訂金 ✅"}</h1>
       <p>${esc(o.guestName)} 您好，我們已確認收到您的${
      full
        ? `款項 <strong>${money(o.totalPrice)}</strong>，本筆訂單已全額付清`
        : `訂金 <strong>${money(o.depositAmount)}</strong>`
    }，您的訂房已完成確認。</p>
       ${orderTable(o, full)}
       ${cancellationBlock(o)}
       ${providerLine}
       ${venueContactBlock(o)}
       ${full ? "<p>入住當天無需再付款。期待與您相見！</p>" : `<p>尾款 ${money(o.balanceAmount)} 請於入住當天現場付清。期待與您相見！</p>`}
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

/**
 * ATM 新制：本地付款期限逾期，訂單已自動取消的旅客通知信。
 * 禁止出現：虛擬帳號、可繼續付款 CTA、「請盡快付款」，
 * 也不得宣稱 TapPay provider 虛擬帳號已技術失效。
 */
export function renderAtmDeadlineExpired(
  o: GroupBuyEmailOrder,
  deadlineText: string,
): { subject: string; html: string } {
  return {
    subject: `【付款期限已過】您的團購訂單已自動取消（${o.orderNumber}）`,
    html: layout(
      "付款期限已過，訂單已自動取消",
      `訂單 ${o.orderNumber} 因未於付款期限內完成付款已自動取消`,
      `<h1>付款期限已過，訂單已自動取消</h1>
       <p>${esc(o.guestName)} 您好，您的訂單因未於指定付款期限內完成訂金繳付，系統已自動取消此筆訂單。</p>
       <table class="info">
         <tr><td class="k">訂單編號</td><td>${esc(o.orderNumber)}</td></tr>
         <tr><td class="k">住宿名稱</td><td>${esc(o.accommodationName ?? o.campaignTitle)}</td></tr>
         <tr><td class="k">入住日期</td><td>${esc(o.checkInDate)}</td></tr>
         <tr><td class="k">退房日期</td><td>${esc(o.checkOutDate)}</td></tr>
         <tr><td class="k">應付訂金</td><td>NT$ ${Number(o.depositAmount || 0).toLocaleString()}</td></tr>
         <tr><td class="k">付款期限</td><td>${esc(deadlineText)}</td></tr>
         <tr><td class="k">訂單狀態</td><td>已取消</td></tr>
       </table>
       <div class="box"><h2>⚠️ 付款期限已過，請勿再轉帳</h2>
       <p style="margin:0">付款期限已過，請勿再轉帳至原 ATM 虛擬帳號。</p></div>
       <p>如仍有入住需求，請重新進行訂購，以取得最新房況及付款資訊。謝謝。</p>`,
    ),
  };
}

/* ─────────────────────────────────────────────────────────────
 * 取消 / 退款通知（民宿端人工操作後由 server 端寄出）
 * 金額一律由呼叫端以 orders 最新資料帶入，此處只負責呈現。
 * ───────────────────────────────────────────────────────────── */

export interface GroupBuyCancelInfo {
  /** 取消時間（已格式化為台北時間文字） */
  cancelledAtText: string;
  /** 已收款金額 */
  paidAmount: number;
  /** 累計已退款金額 */
  refundedTotal: number;
  /** 退款狀態：none / pending_manual / partial_refunded / refunded */
  refundStatus: string;
  reason?: string | null;
  /** 此館人工退款手續費（booking_settings.manual_refund_fee_amount）；0 = 不收 */
  handlingFee?: number;
  /** 已累計扣除的退款處理費 */
  refundFeeTotal?: number;
  /** 館別客服／官方 LINE（人工退款申請引導用；信用卡不適用） */
  venueContact?: VenueContact | null;
  /** ATM 未付款直接取消：提醒請勿再轉帳至原虛擬帳號 */
  atmNoTransferNotice?: boolean;
  /** 信用卡已收款、但依取消政策計算退款金額為 0（非退款失敗） */
  zeroRefundByPolicy?: boolean;
}

/** 信用卡（TapPay 原卡退刷）共用說明：不得出現銀行人工退款排程與匯款手續費 */
const CARD_REFUND_NOTE =
  "退款完成後，款項將退回原付款信用卡，實際入帳時間依發卡銀行作業時間為準（約 3～7 個工作天）。";
const CARD_REFUND_DONE_NOTE =
  "退款已送回原付款信用卡，實際入帳時間依發卡銀行作業時間為準（約 3～7 個工作天）。";
const CARD_REFUND_CHANNEL = "原信用卡退刷（TapPay）";

/** 信用卡版退款說明（絕不輸出銀行排程／NT$30 匯款手續費） */
function cardRefundStatusBlock(info: GroupBuyCancelInfo): string {
  const remaining = Math.max(0, Math.round(info.paidAmount - info.refundedTotal));
  if (info.paidAmount <= 0) return `<p>此訂單尚未付款，無需退款。</p>`;
  if (info.zeroRefundByPolicy) {
    // 明確告知「依規則退款 0 元」，不得寫成退款失敗或退款處理中
    return `<table class="info" style="margin:0 0 10px">
        <tr><td class="k">依取消規則退款金額</td><td><strong>NT$0</strong></td></tr>
      </table><p style="margin:0">依本活動取消規則，本次取消的退款金額為 NT$0；訂單已完成取消，如有疑問請與我們聯繫。</p>`;
  }
  if (info.refundStatus === "refunded") {
    return `<table class="info" style="margin:0 0 10px">
        <tr><td class="k">退款方式</td><td>${CARD_REFUND_CHANNEL}</td></tr>
        <tr><td class="k">累計已退款</td><td><strong>${money(info.refundedTotal)}</strong></td></tr>
        <tr><td class="k">退款狀態</td><td><strong>退款完成</strong></td></tr>
      </table><p style="margin:0">${CARD_REFUND_DONE_NOTE}</p>`;
  }
  if (info.refundStatus === "partial_refunded") {
    return `<table class="info" style="margin:0 0 10px">
        <tr><td class="k">退款方式</td><td>${CARD_REFUND_CHANNEL}</td></tr>
        <tr><td class="k">累計已退款</td><td><strong>${money(info.refundedTotal)}</strong></td></tr>
        <tr><td class="k">退款後實收</td><td>${money(remaining)}</td></tr>
        <tr><td class="k">退款狀態</td><td><strong>部分退款完成</strong></td></tr>
      </table><p style="margin:0">${CARD_REFUND_DONE_NOTE}</p>`;
  }
  if (info.refundStatus === "none") {
    return `<p>此訂單依取消政策不進行退款，如有疑問請與我們聯繫。</p>`;
  }
  // pending_manual 等：退款尚未完成
  return `<table class="info" style="margin:0 0 10px">
      <tr><td class="k">退款方式</td><td>${CARD_REFUND_CHANNEL}</td></tr>
      <tr><td class="k">預計原卡退刷</td><td><strong>${money(remaining)}</strong></td></tr>
      <tr><td class="k">退款狀態</td><td><strong>原信用卡退刷處理中</strong></td></tr>
    </table><p style="margin:0">${CARD_REFUND_NOTE}</p>`;
}

function refundStatusBlock(info: GroupBuyCancelInfo, isCardOrder = false): string {
  if (isCardOrder) return cardRefundStatusBlock(info);
  const feeTotal = Math.max(0, Math.round(Number(info.refundFeeTotal) || 0));
  // 已沖銷金額＝實退旅客 + 已扣除的退款處理費
  const remaining = Math.max(0, Math.round(info.paidAmount - info.refundedTotal - feeTotal));
  // 尚有款項待退時，附上共用的退款時程規則（手續費金額由館別設定帶入）
  const schedule = `<div style="margin-top:10px">${
    refundScheduleHtml({ handlingFee: info.handlingFee ?? 0 })
  }</div>`;
  if (info.paidAmount <= 0) {
    return `<p>此訂單尚未付款，無需退款。</p>`;
  }
  if (info.refundStatus === "refunded") {
    return `<p>此訂單退款已全部完成，累計退款 <strong>${money(info.refundedTotal)}</strong>。</p>${
      feeTotal > 0 ? `<p style="margin:6px 0 0">已扣除匯款手續費 <strong>${money(feeTotal)}</strong>。</p>` : ""
    }`;
  }
  /**
   * 待退款金額三段呈現：政策應退（gross）／匯款手續費／預計實際退款（payout）。
   * 手續費一律取 info.handlingFee（館別 booking_settings.manual_refund_fee_amount），
   * 不得寫死金額；fee = 0 時不輸出手續費列。
   */
  const pendingRows = (gross: number) => {
    const fee = Math.min(Math.max(0, Math.round(Number(info.handlingFee) || 0)), gross);
    const payout = Math.max(0, gross - fee);
    return `<table class="info" style="margin:0 0 10px">
        <tr><td class="k">政策應退金額</td><td>${money(gross)}</td></tr>
        ${fee > 0 ? `<tr><td class="k">匯款手續費</td><td>-${money(fee)}</td></tr>` : ""}
        <tr><td class="k">預計實際退款</td><td><strong>${money(payout)}</strong></td></tr>
      </table>`;
  };
  if (info.refundStatus === "partial_refunded") {
    return `<p>目前已退款 <strong>${money(info.refundedTotal)}</strong>，尚有款項待退款，我們會盡快處理完成。</p>${
      pendingRows(remaining)
    }${schedule}`;
  }
  if (info.refundStatus === "none") {
    return `<p>此訂單依取消條件不進行退款，如有疑問請與我們聯繫。</p>`;
  }
  return `<p>此訂單已有付款紀錄，目前退款處理中。</p>${pendingRows(remaining)}${schedule}`;
}

export function renderOrderCancelled(
  o: GroupBuyEmailOrder,
  info: GroupBuyCancelInfo,
): { subject: string; html: string } {
  const isCard = o.isCardOrder === true;
  return {
    subject: `【訂單已取消】${o.campaignTitle} 訂單 ${o.orderNumber}`,
    html: layout(
      "訂單已取消",
      `訂單 ${o.orderNumber} 已取消`,
      `<h1>您的訂單已取消</h1>
       <p>${esc(o.guestName)} 您好，您的訂單 <strong>${esc(o.orderNumber)}</strong> 已完成取消。</p>
       ${orderTable(o, false, { hideDue: true })}
       <table class="info">
         <tr><td class="k">取消時間</td><td>${esc(info.cancelledAtText)}</td></tr>
         <tr><td class="k">已付款金額</td><td>${money(info.paidAmount)}</td></tr>
         ${o.paymentMethodText ? `<tr><td class="k">原付款方式</td><td>${esc(o.paymentMethodText)}</td></tr>` : ""}
         ${
        info.paidAmount > 0 && o.refundChannelText
          ? `<tr><td class="k">退款方式</td><td>${esc(o.refundChannelText)}</td></tr>`
          : ""
      }
         ${info.reason ? `<tr><td class="k">取消原因</td><td>${esc(info.reason)}</td></tr>` : ""}
       </table>
       <div class="box"><h2>退款說明</h2>${refundStatusBlock(info, isCard)}</div>
       ${
      info.atmNoTransferNotice
        ? `<div class="box"><h2>⚠️ 訂單已取消，請勿再轉帳</h2>
       <p style="margin:0">此訂單已取消，原 ATM 虛擬帳號請勿再轉帳；若仍完成轉帳，款項需另行人工退還。</p></div>`
        : ""
    }
       ${
      // 人工退款申請說明：僅 ATM／銀行匯款且尚有款項待退時顯示；信用卡原卡退刷不適用
      !isCard && info.paidAmount > 0 &&
        info.refundStatus !== "refunded" && info.refundStatus !== "none"
        ? manualRefundRequestHtml(info.venueContact)
        : ""
    }
       ${cancellationBlock(o)}
       ${o.orderUrl ? `<p style="text-align:center"><a class="btn" href="${esc(o.orderUrl)}">查詢訂單</a></p>` : ""}`,
    ),
  };
}

export interface GroupBuyRefundInfo {
  /** 本次登記的退款金額 */
  refundAmount: number;
  /** 累計已退款 */
  refundedTotal: number;
  /** 已收款金額 */
  paidAmount: number;
  refundStatus: string;
  /** 退款時間（已格式化為台北時間文字） */
  refundedAtText: string;
  note?: string | null;
  /** 本次扣除的退款處理費（信用卡一律 0） */
  refundFee?: number;
  /** 累計已扣除的退款處理費 */
  refundFeeTotal?: number;
}

export function renderRefundProcessed(
  o: GroupBuyEmailOrder,
  info: GroupBuyRefundInfo,
): { subject: string; html: string } {
  const feeTotal = Math.max(0, Math.round(Number(info.refundFeeTotal) || 0));
  const feeThisTime = Math.max(0, Math.round(Number(info.refundFee) || 0));
  const remaining = Math.max(0, Math.round(info.paidAmount - info.refundedTotal - feeTotal));
  const done = info.refundStatus === "refunded";
  const partial = info.refundStatus === "partial_refunded";
  const isCard = o.isCardOrder === true;
  const title = done ? "退款完成" : partial ? "部分退款完成" : "退款進度通知";
  const lead = done
    ? "此訂單退款已全部完成。"
    : partial
    ? `本次退款 <strong>${money(info.refundAmount)}</strong> 已完成，退款後實收 <strong>${
      money(remaining)
    }</strong>。`
    : `本次已登記退款 <strong>${money(info.refundAmount)}</strong>，目前尚有 <strong>${
      money(remaining)
    }</strong> 待退款。`;

  const cardRows = isCard
    ? `<tr><td class="k">付款／退款方式</td><td>信用卡（TapPay 原卡退刷）</td></tr>
         <tr><td class="k">原信用卡付款</td><td>${money(info.paidAmount)}</td></tr>`
    : `${o.paymentMethodText ? `<tr><td class="k">原付款方式</td><td>${esc(o.paymentMethodText)}</td></tr>` : ""}
         <tr><td class="k">退款方式</td><td>${esc(o.refundChannelText ?? "人工匯款退款")}</td></tr>
         <tr><td class="k">已收款金額</td><td>${money(info.paidAmount)}</td></tr>`;

  return {
    subject: `【${title}】${o.campaignTitle} 訂單 ${o.orderNumber}`,
    html: layout(
      title,
      `訂單 ${o.orderNumber} ${title}`,
      `<h1>${done ? "退款已全部完成 ✅" : partial ? "部分退款已完成 ✅" : "退款進度通知"}</h1>
       <p>${esc(o.guestName)} 您好，${lead}</p>
       <table class="info">
         <tr><td class="k">訂單編號</td><td><strong>${esc(o.orderNumber)}</strong></td></tr>
         <tr><td class="k">團購活動</td><td>${esc(o.campaignTitle)}</td></tr>
         ${o.accommodationName ? `<tr><td class="k">住宿</td><td>${esc(o.accommodationName)}</td></tr>` : ""}
         ${o.packageName ? `<tr><td class="k">方案</td><td>${esc(o.packageName)}</td></tr>` : ""}
         <tr><td class="k">訂單總額</td><td>${money(o.totalPrice)}</td></tr>
         ${cardRows}
         ${
        !isCard && feeThisTime > 0
          ? `<tr><td class="k">政策應退金額</td><td>${money(info.refundAmount + feeThisTime)}</td></tr>
         <tr><td class="k">匯款手續費</td><td>-${money(feeThisTime)}</td></tr>`
          : ""
      }
         <tr><td class="k">${isCard ? "本次原卡退刷" : "本次實際退款"}</td><td><strong style="color:${BRAND.primary}">${
        money(info.refundAmount)
      }</strong></td></tr>
         <tr><td class="k">${isCard ? "累計已退款" : "累計實際退款"}</td><td>${money(info.refundedTotal)}</td></tr>
         ${feeTotal > 0 ? `<tr><td class="k">累計手續費</td><td>${money(feeTotal)}</td></tr>` : ""}
         <tr><td class="k">${isCard ? "退款後實收" : "剩餘待退款"}</td><td>${money(remaining)}</td></tr>
         <tr><td class="k">退款狀態</td><td><strong>${
        done ? "退款完成" : partial ? "部分退款完成" : "退款處理中"
      }</strong></td></tr>
         <tr><td class="k">退款時間</td><td>${esc(info.refundedAtText)}</td></tr>
         ${info.note ? `<tr><td class="k">備註</td><td>${esc(info.note)}</td></tr>` : ""}
       </table>
       ${isCard ? `<p>${CARD_REFUND_DONE_NOTE}</p>` : ""}
       ${o.orderUrl ? `<p style="text-align:center"><a class="btn" href="${esc(o.orderUrl)}">查詢訂單</a></p>` : ""}`,
    ),
  };
}



/** 實際送出（缺 key 或缺信箱時安靜跳過，不影響主流程） */
export async function sendGroupBuyEmail(
  to: string | string[] | null | undefined,
  mail: { subject: string; html: string },
): Promise<{ ok: boolean; reason?: string }> {
  const recipients = (Array.isArray(to) ? to : [to])
    .map((v) => String(v ?? "").trim())
    .filter((v) => v.length > 0);
  if (recipients.length === 0) return { ok: false, reason: "no_email" };
  const resendKey = Deno.env.get("RESEND_API_KEY_LAKEZE") ?? Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return { ok: false, reason: "email_not_configured" };

  try {
    const resp = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: recipients, subject: mail.subject, html: mail.html }),
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


/* ─────────────────────────────────────────────────────────────
 * 民宿／管理者內部通知（與旅客信完全分開，收件人只由後端 DB 設定解析）
 * ───────────────────────────────────────────────────────────── */

export interface VenueNotifyOrder extends GroupBuyEmailOrder {
  guestPhone?: string | null;
  guestEmail?: string | null;
  nights?: number | null;
  adultCount?: number | null;
  childCount?: number | null;
  toddlerCount?: number | null;
  infantCount?: number | null;
  childBreakdownText?: string | null;
  paymentStatusText?: string | null;
  /** 後台連結（AdminGroupBuy） */
  adminUrl?: string | null;
}

function venueBaseRows(o: VenueNotifyOrder): string {
  return `<tr><td class="k">訂單編號</td><td><strong>${esc(o.orderNumber)}</strong></td></tr>
    <tr><td class="k">團購活動</td><td>${esc(o.campaignTitle)}</td></tr>
    ${o.accommodationName ? `<tr><td class="k">民宿</td><td>${esc(o.accommodationName)}</td></tr>` : ""}
    ${o.packageName ? `<tr><td class="k">方案</td><td>${esc(o.packageName)}</td></tr>` : ""}
    <tr><td class="k">入住日期</td><td>${esc(o.checkInDate)}</td></tr>
    <tr><td class="k">退房日期</td><td>${esc(o.checkOutDate)}</td></tr>
    ${o.nights ? `<tr><td class="k">住宿晚數</td><td>${esc(o.nights)} 晚</td></tr>` : ""}
    <tr><td class="k">旅客姓名</td><td>${esc(o.guestName)}</td></tr>
    ${o.guestPhone ? `<tr><td class="k">聯絡電話</td><td>${esc(o.guestPhone)}</td></tr>` : ""}
    ${o.guestEmail ? `<tr><td class="k">Email</td><td>${esc(o.guestEmail)}</td></tr>` : ""}`;
}

export function renderVenueNewOrder(
  o: VenueNotifyOrder,
  opts?: { fullPayment?: boolean },
): { subject: string; html: string } {
  const full = opts?.fullPayment === true;
  const guests = [
    `成人 ${Number(o.adultCount ?? 0)}`,
    `兒童 ${Number(o.childCount ?? 0)}`,
    `幼兒 ${Number(o.toddlerCount ?? 0)}`,
    `嬰兒 ${Number(o.infantCount ?? 0)}`,
  ].join("　");
  return {
    subject: full
      ? `【新團購訂單・已付款】${o.accommodationName ?? o.campaignTitle} 訂單 ${o.orderNumber}`
      : `【新團購訂單・待匯款】${o.accommodationName ?? o.campaignTitle} 訂單 ${o.orderNumber}`,
    html: layout(
      "新團購訂單",
      full ? `訂單 ${o.orderNumber} 已成立且全額付清` : `訂單 ${o.orderNumber} 已成立，待旅客匯款`,
      `<h1>新團購訂單</h1>
       <p>${
      full
        ? "有一筆新的團購訂單成立，旅客已以信用卡全額付款完成。"
        : "有一筆新的團購訂單成立，目前狀態為「待匯款」，請留意入帳並於後台確認。"
    }</p>
       <table class="info">
         ${venueBaseRows(o)}
         <tr><td class="k">入住人數</td><td>${esc(guests)}</td></tr>
         <tr><td class="k">訂單金額</td><td>${money(o.totalPrice)}</td></tr>
         ${
      full
        ? `<tr><td class="k">收款狀態</td><td><strong style="color:${BRAND.primary}">已全額收款（信用卡）</strong></td></tr>`
        : `<tr><td class="k">應付訂金</td><td><strong style="color:${BRAND.primary}">${money(o.depositAmount)}</strong></td></tr>
         <tr><td class="k">入住支付尾款</td><td>${money(o.balanceAmount)}</td></tr>
         <tr><td class="k">付款狀態</td><td>待匯款</td></tr>`
    }
       </table>
       ${o.childBreakdownText ? `<div class="box"><h2>兒童加價</h2><p style="white-space:pre-line;margin:0">${esc(o.childBreakdownText)}</p></div>` : ""}
       ${o.adminUrl ? `<p style="text-align:center"><a class="btn" href="${esc(o.adminUrl)}">前往後台查看訂單</a></p>` : ""}`,
    ),
  };
}

export interface VenueTransferInfo {
  accountLast5: string;
  transferDateText: string;
  transferTimeText: string;
}

export function renderVenueTransferReported(
  o: VenueNotifyOrder,
  info: VenueTransferInfo,
): { subject: string; html: string } {
  return {
    subject: `【客人已回報匯款】${o.accommodationName ?? o.campaignTitle} 訂單 ${o.orderNumber}`,
    html: layout(
      "客人已回報匯款",
      `訂單 ${o.orderNumber} 旅客已回報完成匯款`,
      `<h1>客人已回報匯款</h1>
       <p>旅客已回報完成匯款，請核對入帳後於後台確認收款。</p>
       <table class="info">
         ${venueBaseRows(o)}
         <tr><td class="k">應付訂金</td><td><strong style="color:${BRAND.primary}">${money(o.depositAmount)}</strong></td></tr>
         <tr><td class="k">目前付款狀態</td><td>${esc(o.paymentStatusText ?? "待匯款")}</td></tr>
       </table>
       <div class="box"><h2>匯款回報資訊</h2>
         <table class="info" style="margin:0">
           <tr><td class="k">匯款帳號後五碼</td><td><strong>${esc(info.accountLast5)}</strong></td></tr>
           <tr><td class="k">匯款日期</td><td>${esc(info.transferDateText)}</td></tr>
           <tr><td class="k">匯款時間</td><td>${esc(info.transferTimeText)}</td></tr>
         </table>
       </div>
       ${o.adminUrl ? `<p style="text-align:center"><a class="btn" href="${esc(o.adminUrl)}">前往後台確認入帳</a></p>` : ""}`,
    ),
  };
}

/* ─────────────────────────────────────────────────────────────
 * 旅客提出取消申請（旅客確認信 + 民宿通知信）
 * ───────────────────────────────────────────────────────────── */

export interface GroupBuyCancelRequestInfo {
  requestedAtText: string;
  reason?: string | null;
  paidAmount?: number | null;
  /** 此館人工退款手續費（booking_settings.manual_refund_fee_amount）；0 = 不顯示手續費文案 */
  handlingFee?: number;
}

/** 寄給旅客：已收到取消申請 */
export function renderGuestCancelRequested(
  o: GroupBuyEmailOrder,
  info: GroupBuyCancelRequestInfo,
): { subject: string; html: string } {
  return {
    subject: `【已收到取消申請】${o.campaignTitle} 訂單 ${o.orderNumber}`,
    html: layout(
      "已收到取消申請",
      `訂單 ${o.orderNumber} 取消申請已送出`,
      `<h1>已收到您的取消申請</h1>
       <p>${esc(o.guestName)} 您好，我們已收到訂單 <strong>${esc(o.orderNumber)}</strong> 的取消申請，民宿將盡快與您確認後續處理。</p>
       ${orderTable(o)}
       <table class="info">
         <tr><td class="k">申請時間</td><td>${esc(info.requestedAtText)}</td></tr>
         ${info.reason ? `<tr><td class="k">取消原因</td><td>${esc(info.reason)}</td></tr>` : ""}
       </table>
       <p>提醒：取消申請尚未完成，訂單狀態仍為原狀態，實際取消與退款結果將於民宿確認後另行通知。</p>
       <div class="box"><h2>退款時間</h2>${refundScheduleHtml({ showPendingReview: true, handlingFee: info.handlingFee ?? 0 })}</div>
       ${o.orderUrl ? `<p style="text-align:center"><a class="btn" href="${esc(o.orderUrl)}">查詢訂單狀態</a></p>` : ""}`,
    ),
  };
}

/** 寄給民宿／管理者：旅客提出取消申請 */
export function renderVenueCancelRequested(
  o: VenueNotifyOrder,
  info: GroupBuyCancelRequestInfo,
): { subject: string; html: string } {
  return {
    subject: `【取消申請】${o.campaignTitle}／訂單 ${o.orderNumber}`,
    html: layout(
      "旅客提出取消申請",
      `訂單 ${o.orderNumber} 旅客提出取消申請`,
      `<h1>旅客提出取消申請</h1>
       <p>請前往後台確認是否受理取消，並依收款狀況處理退款。</p>
       <table class="info">
         ${venueBaseRows(o)}
         <tr><td class="k">申請時間</td><td>${esc(info.requestedAtText)}</td></tr>
         ${info.reason ? `<tr><td class="k">取消原因</td><td>${esc(info.reason)}</td></tr>` : ""}
         ${info.paidAmount ? `<tr><td class="k">已收款金額</td><td>${money(info.paidAmount)}</td></tr>` : ""}
       </table>
       ${o.adminUrl ? `<p style="text-align:center"><a class="btn" href="${esc(o.adminUrl)}">前往後台處理取消</a></p>` : ""}`,
    ),
  };
}

/** 寄給民宿／管理者：旅客自助取消，訂單已即時取消（不需人工審核） */
export function renderVenueOrderSelfCancelled(
  o: VenueNotifyOrder,
  info: {
    cancelledAtText: string;
    reason?: string | null;
    paidAmount: number;
    refundedAmount: number;
    refundStatus: string;
    refundChannelText: string;
  },
): { subject: string; html: string } {
  return {
    subject: `【訂單已取消】${o.campaignTitle}／訂單 ${o.orderNumber}`,
    html: layout(
      "旅客自助取消訂單",
      `訂單 ${o.orderNumber} 已由旅客自助取消`,
      `<h1>旅客已自助取消訂單</h1>
       <p>此訂單已即時取消並釋出房間，無需人工審核。</p>
       <table class="info">
         ${venueBaseRows(o)}
         <tr><td class="k">取消時間</td><td>${esc(info.cancelledAtText)}</td></tr>
         ${info.reason ? `<tr><td class="k">取消原因</td><td>${esc(info.reason)}</td></tr>` : ""}
         <tr><td class="k">已收款金額</td><td>${money(info.paidAmount)}</td></tr>
         <tr><td class="k">本次退款</td><td>${money(info.refundedAmount)}</td></tr>
         <tr><td class="k">退款方式</td><td>${esc(info.refundChannelText)}</td></tr>
         <tr><td class="k">退款狀態</td><td>${esc(info.refundStatus)}</td></tr>
       </table>
       ${o.adminUrl ? `<p style="text-align:center"><a class="btn" href="${esc(o.adminUrl)}">前往後台查看</a></p>` : ""}`,
    ),
  };
}
