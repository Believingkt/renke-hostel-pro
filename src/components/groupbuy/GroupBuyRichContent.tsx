import { useMemo } from "react";
import { sanitizeHtml } from "@/utils/sanitizeHtml";
import { looksLikeHtml, toPlainTextBlocks } from "@/lib/plainTextFormat";
import { GroupBuyCollapsibleHtml } from "@/components/groupbuy/GroupBuyCollapsibleHtml";

/**
 * 團購文案專用的嚴格 allowlist（不影響 sanitizeHtml 的全站預設設定）。
 * 只允許段落、基本字體樣式、條列、H2～H4 與超連結；
 * style / class / img / table / script / iframe 一律移除，避免後台內容破壞前台版型。
 */
export const GROUP_BUY_HTML_CONFIG = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "ul",
    "ol",
    "li",
    "h2",
    "h3",
    "h4",
    "a",
  ],
  ALLOWED_ATTR: ["href", "target", "rel"],
  ALLOW_DATA_ATTR: false,
} as const;

/** 團購文案 sanitize：嚴格模式 */
export function sanitizeGroupBuyHtml(raw: string | null | undefined): string {
  return sanitizeHtml(raw, { ...GROUP_BUY_HTML_CONFIG } as any);
}

/** 純文字（含 \n 與 ・／•／- 條列）轉為安全 HTML，保留換行語意 */
export function plainTextToGroupBuyHtml(raw: string | null | undefined): string {
  const blocks = toPlainTextBlocks(raw);
  if (blocks.length === 0) return "";
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  let html = "";
  let inList = false;
  for (const b of blocks) {
    if (b.type === "li") {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${esc(b.text)}</li>`;
    } else {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += `<p>${esc(b.text)}</p>`;
    }
  }
  if (inList) html += "</ul>";
  return html;
}

/**
 * 團購文案 render：
 * 內容看起來是 HTML → 嚴格 sanitize；舊的純文字 → 自動還原換行與條列。
 * 不修改任何資料庫內容，純 rendering 層處理。
 */
export function renderGroupBuyRichHtml(raw: string | null | undefined): string {
  if (!raw) return "";
  return looksLikeHtml(raw) ? sanitizeGroupBuyHtml(raw) : plainTextToGroupBuyHtml(raw);
}

interface Props {
  html: string | null | undefined;
  collapsedHeight?: number;
  className?: string;
  moreLabel?: string;
  lessLabel?: string;
}

/** 團購活動文案／注意事項的顯示元件（沿用既有收合行為） */
export function GroupBuyRichContent({ html, collapsedHeight, className, moreLabel, lessLabel }: Props) {
  const rendered = useMemo(() => renderGroupBuyRichHtml(html), [html]);
  if (!rendered) return null;
  return (
    <GroupBuyCollapsibleHtml
      html={rendered}
      collapsedHeight={collapsedHeight}
      className={className}
      moreLabel={moreLabel}
      lessLabel={lessLabel}
    />
  );
}

export default GroupBuyRichContent;
