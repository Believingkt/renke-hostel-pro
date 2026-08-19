/**
 * 純文字內容的閱讀格式化（rendering 層，不修改任何資料庫內容）。
 *
 * 用途：FAQ 等欄位多為「純文字 + \n + ．／・／• 條列符號」，
 * 直接丟進 HTML renderer 會讓換行被 collapse 成一整段。
 */

const HTML_TAG_RE = /<\/?(p|br|ul|ol|li|div|span|strong|em|b|i|h[1-6]|a|table|img|blockquote)\b[^>]*>/i;

/** 是否包含真正的 HTML 標籤（有的話交回既有 sanitizeHtml 流程處理） */
export function looksLikeHtml(text: string | null | undefined): boolean {
  return !!text && HTML_TAG_RE.test(text);
}

/** 常見條列行首符號 */
const BULLET_RE = /^\s*([・．·•●◦*\-－–—]|\d+[.)、])\s*/;

export interface PlainTextBlock {
  type: "li" | "p";
  text: string;
}

/** 將純文字切成條列／段落區塊，保留原有換行語意 */
export function toPlainTextBlocks(text: string | null | undefined): PlainTextBlock[] {
  if (!text) return [];
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const bullet = BULLET_RE.test(line);
      return {
        type: bullet ? ("li" as const) : ("p" as const),
        text: bullet ? line.replace(BULLET_RE, "").trim() : line,
      };
    })
    .filter((b) => b.text.length > 0);
}
