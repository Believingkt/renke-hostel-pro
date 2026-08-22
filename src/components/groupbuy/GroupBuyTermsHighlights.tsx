import { useMemo, useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { renderGroupBuyRichHtml } from "@/components/groupbuy/GroupBuyRichContent";

interface Props {
  html: string | null | undefined;
  /** 第一層摘要顯示幾條（3～5） */
  summaryCount?: number;
}

/** 從已 sanitize 的 HTML 取出前幾條「條列或段落」純文字，作為第一層摘要 */
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
 * 團購活動須知：第一層只顯示 3～5 條最重要條件，完整 Rich Text 收合在「查看完整團購活動須知」。
 * 內容全部來自既有 campaign.terms_html，不寫死任何文案。
 */
export function GroupBuyTermsHighlights({ html, summaryCount = 4 }: Props) {
  const rendered = useMemo(() => renderGroupBuyRichHtml(html), [html]);
  const lines = useMemo(() => extractLines(rendered), [rendered]);
  const [open, setOpen] = useState(false);

  if (!rendered) return null;
  const summary = lines.slice(0, summaryCount);
  // 條列被截斷（line-clamp-2）時也要能展開看完整內容
  const hasMore = lines.length > summary.length || summary.some((t) => t.length > 40);

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
              <span className="line-clamp-2">{t}</span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div
          className="prose prose-sm max-w-none text-muted-foreground prose-headings:text-foreground prose-strong:text-foreground"
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
      )}

      {(hasMore || open) && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-2 inline-flex min-h-[44px] items-center justify-center gap-1.5 p-0 text-sm font-medium leading-none text-primary underline underline-offset-4"
        >
          {open ? "收合活動須知" : "查看完整團購活動須知"}
          <ChevronDown className={`block h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
}

export default GroupBuyTermsHighlights;
