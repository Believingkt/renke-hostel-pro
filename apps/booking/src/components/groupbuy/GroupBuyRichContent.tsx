import { useMemo } from "react";
import { sanitizeHtml } from "@lakeze/shared/utils/sanitizeHtml";
import { looksLikeHtml, toPlainTextBlocks } from "@lakeze/shared/lib/plainTextFormat";
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

/** 純文字（含 \n 與 ・／•／- 條列、1. 2. 3. 編號）轉為安全 HTML，保留換行語意 */
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
  let listTag: "ul" | "ol" | null = null;
  const closeList = () => {
    if (listTag) {
      html += `</${listTag}>`;
      listTag = null;
    }
  };
  for (const b of blocks) {
    if (b.type === "li") {
      const tag = b.ordered ? "ol" : "ul";
      if (listTag !== tag) {
        closeList();
        html += `<${tag}>`;
        listTag = tag;
      }
      html += `<li>${esc(b.text)}</li>`;
    } else {
      closeList();
      html += `<p>${esc(b.text)}</p>`;
    }
  }
  closeList();
  return html;
}

const ORDERED_LINE_RE = /^\s*(\d{1,2})[.)、]\s+/;
const BULLET_LINE_RE = /^\s*(?:[・．·•●◦]\s*|[-－–—]\s+)/;

/**
 * 顯示層自動格式化（不改 DB）：
 * 舊資料常見「<p>1. xxx<br>2. xxx<br>3. xxx</p>」的人工編號，
 * 在前台轉成真正的 <ol><li>；行首 ・／•／- 則轉成 <ul><li>。
 */
export function autoFormatGroupBuyLists(html: string): string {
  if (!html || typeof window === "undefined" || typeof DOMParser === "undefined") return html;
  try {
    const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, "text/html");
    const root = doc.getElementById("__root");
    if (!root) return html;

    const paragraphs = Array.from(root.querySelectorAll("p"));
    for (const p of paragraphs) {
      // 依 <br> 拆行（保留 inline HTML）
      const segments: string[] = [];
      let buf = "";
      p.childNodes.forEach((node) => {
        if (node.nodeType === 1 && (node as Element).tagName === "BR") {
          segments.push(buf);
          buf = "";
        } else if (node.nodeType === 1) {
          buf += (node as Element).outerHTML;
        } else {
          buf += (node.textContent || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
        }
      });
      segments.push(buf);

      const lines = segments.map((s) => s.trim()).filter((s) => s.length > 0);
      if (lines.length < 2) continue;

      type Chunk = { kind: "p" | "ol" | "ul"; items: string[] };
      const chunks: Chunk[] = [];
      for (const line of lines) {
        const plain = line.replace(/<[^>]*>/g, "");
        const kind: Chunk["kind"] = ORDERED_LINE_RE.test(plain)
          ? "ol"
          : BULLET_LINE_RE.test(plain)
            ? "ul"
            : "p";
        const text =
          kind === "ol"
            ? line.replace(/^(\s*(?:<[^>]*>\s*)*)\d{1,2}[.)、]\s+/, "$1")
            : kind === "ul"
              ? line.replace(/^(\s*(?:<[^>]*>\s*)*)(?:[・．·•●◦]\s*|[-－–—]\s+)/, "$1")
              : line;
        const last = chunks[chunks.length - 1];
        if (last && last.kind === kind && kind !== "p") last.items.push(text);
        else chunks.push({ kind, items: [text] });
      }

      const hasList = chunks.some((c) => c.kind !== "p" && c.items.length >= 2);
      if (!hasList) continue;

      const replacement = chunks
        .map((c) => {
          if (c.kind === "p") return c.items.map((t) => `<p>${t}</p>`).join("");
          const tag = c.kind;
          return `<${tag}>${c.items.map((t) => `<li>${t}</li>`).join("")}</${tag}>`;
        })
        .join("");

      const holder = doc.createElement("div");
      holder.innerHTML = replacement;
      p.replaceWith(...Array.from(holder.childNodes));
    }

    return root.innerHTML;
  } catch {
    return html;
  }
}

/**
 * 團購文案 render：
 * 內容看起來是 HTML → 嚴格 sanitize；舊的純文字 → 自動還原換行與條列。
 * 之後再做顯示層的清單自動格式化。不修改任何資料庫內容。
 */
export function renderGroupBuyRichHtml(raw: string | null | undefined): string {
  if (!raw) return "";
  const base = looksLikeHtml(raw) ? sanitizeGroupBuyHtml(raw) : plainTextToGroupBuyHtml(raw);
  return autoFormatGroupBuyLists(base);
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
