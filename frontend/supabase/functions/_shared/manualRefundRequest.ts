/**
 * 人工退款申請說明（ATM 虛擬帳號／銀行匯款專用）。
 * 信用卡（TapPay 原卡退刷）不得使用本文案。
 *
 * ⚠️ 內容必須與 src/lib/manualRefundRequest.ts 完全一致。
 */

export const MANUAL_REFUND_TITLE = "人工退款說明";

export const MANUAL_REFUND_INTRO =
  "本筆訂單退款將由館方人工辦理。請您聯繫客服或官方 LINE，並提供退款帳戶資料，以利後續退款作業。";

export const MANUAL_REFUND_FIELDS_TITLE = "請準備以下資料：";

export const MANUAL_REFUND_REQUIRED_FIELDS = [
  "訂單編號",
  "訂購姓名",
  "銀行名稱",
  "銀行代碼",
  "退款帳號",
  "戶名",
  "存摺封面照片或帳戶證明",
];

export const MANUAL_REFUND_OUTRO = "客服確認資料後，將依退款流程安排退款。";

export const MANUAL_REFUND_NO_CONTACT = "請聯繫客服協助辦理退款。";

export interface VenueContact {
  phone?: string | null;
  lineId?: string | null;
  websiteUrl?: string | null;
  email?: string | null;
}

export function lineOfficialUrl(lineId?: string | null): string | null {
  const id = String(lineId ?? "").trim();
  if (!id) return null;
  if (/^https?:\/\//i.test(id)) return id;
  return `https://line.me/R/ti/p/${encodeURIComponent(id.startsWith("@") ? id : `@${id}`)}`;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 取消 Email 用的人工退款申請說明區塊（僅 ATM／銀行匯款呼叫） */
export function manualRefundRequestHtml(contact?: VenueContact | null): string {
  const line = lineOfficialUrl(contact?.lineId);
  const rows: string[] = [];
  if (line) rows.push(`<tr><td class="k">官方 LINE</td><td><a href="${esc(line)}">${esc(line)}</a></td></tr>`);
  if (contact?.phone) rows.push(`<tr><td class="k">客服電話</td><td>${esc(contact.phone)}</td></tr>`);
  if (contact?.email) rows.push(`<tr><td class="k">客服信箱</td><td>${esc(contact.email)}</td></tr>`);
  if (contact?.websiteUrl) {
    rows.push(`<tr><td class="k">官方網站</td><td><a href="${esc(contact.websiteUrl)}">${esc(contact.websiteUrl)}</a></td></tr>`);
  }

  return `<div class="box" style="margin-top:12px">
      <h2>${MANUAL_REFUND_TITLE}</h2>
      <p style="margin:0 0 8px">${MANUAL_REFUND_INTRO}</p>
      <p style="margin:0 0 4px">${MANUAL_REFUND_FIELDS_TITLE}</p>
      <ul style="margin:0 0 8px;padding-left:20px">
        ${MANUAL_REFUND_REQUIRED_FIELDS.map((f) => `<li>${esc(f)}</li>`).join("")}
      </ul>
      ${rows.length ? `<table class="info" style="margin:0 0 8px">${rows.join("")}</table>` : `<p style="margin:0 0 8px">${MANUAL_REFUND_NO_CONTACT}</p>`}
      <p style="margin:0">${MANUAL_REFUND_OUTRO}</p>
    </div>`;
}
