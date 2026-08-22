import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  html: string;
  /** 收合時的最大高度（px），超過才顯示展開按鈕 */
  collapsedHeight?: number;
  moreLabel?: string;
  lessLabel?: string;
  className?: string;
}

/** HTML 區塊「摘要 → 展開全文」：僅視覺收合，內容完整保留 */
export function GroupBuyCollapsibleHtml({
  html,
  collapsedHeight = 220,
  moreLabel = "展開全文",
  lessLabel = "收合",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const isLong = html.replace(/<[^>]+>/g, "").trim().length > 200;

  return (
    <div>
      <div className="relative">
        <div
          className={cn(className, !open &&isLong && "overflow-hidden")}
          style={!open &&isLong ? { maxHeight: collapsedHeight } : undefined}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {!open &&isLong && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />
        )}
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4 min-h-[44px] py-2"
        >
          {open ? lessLabel : moreLabel}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      )}
    </div>
  );
}

export default GroupBuyCollapsibleHtml;
