import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { renderGroupBuyRichHtml } from "@/components/groupbuy/GroupBuyRichContent";

interface Props {
  /** 完整團購活動注意事項（Rich Text，Source of Truth） */
  html: string | null | undefined;
  /** 後台設定的「活動須知重點」（3～5 條），沒有設定時自動由完整內容取前幾條 */
  highlights?: string[] | null;
  /** 沒有重點欄位時，自動摘要顯示幾條 */
  summaryCount?: number;
}

/** 從已 render 的 HTML 取出條列／段落純文字，作為 fallback 摘要 */
function extractLines(rendered: string): string[] {
  if (typeof window === "undefined" || !rendered) return [];
  const doc = new DOMParser().parseFromString(`<div>${rendered}</div>`, "text/html");
  const nodes = Array.from(doc.querySelectorAll("li, p, h2, h3, h4"));
  const lines = nodes
    .map((n) => (n.textContent || "").replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 1);
  return Array.from(new Set(lines));
}

/**
 * 團購活動須知：
 * 收合＝「活動須知重點」3～5 條（自然換行，不做 line-clamp）
 * 展開＝後台完整 Rich Text（無任何高度／溢出限制）
 */
export function GroupBuyTermsHighlights({ html, highlights, summaryCount = 5 }: Props) {
  const rendered = useMemo(() => renderGroupBuyRichHtml(html), [html]);
  const manual = (highlights ?? []).map((s) => (s ?? "").trim()).filter(Boolean);
  const autoLines = useMemo(() => (manual.length > 0 ? [] : extractLines(rendered)), [rendered, manual.length]);
  const [open, setOpen] = useState(false);

  if (!rendered && manual.length === 0) return null;

  const summary = manual.length > 0 ? manual.slice(0, 5) : autoLines.slice(0, summaryCount);
  const canExpand = !!rendered;

  return (
    <div className="mt-6 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:p-5">
      <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
        <Info className="h-4 w-4 shrink-0 text-primary" />
        團購活動須知
      </h3>

      {!open && summary.length > 0 && (
        <ul className="space-y-2">
          {summary.map((t, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
              <span className="min-w-0 break-words">{t}</span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div
          className="gb-rich max-w-[70ch] text-sm text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
      )}

      {canExpand && (
        <>
          <div className="mt-3 border-t border-border/60" />
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="icon-btn mt-1 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 text-sm font-medium leading-none text-primary underline underline-offset-4 sm:w-auto"
          >
            <span>{open ? "收合活動須知" : "查看完整活動須知"}</span>
            {open ? (
              <ChevronUp className="block h-4 w-4 shrink-0" />
            ) : (
              <ChevronDown className="block h-4 w-4 shrink-0" />
            )}
          </button>
        </>
      )}
    </div>
  );
}

export default GroupBuyTermsHighlights;
