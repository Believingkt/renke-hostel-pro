import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  text: string;
  /** 收合時顯示行數（手機） */
  clampClass?: string;
  moreLabel?: string;
  lessLabel?: string;
  className?: string;
  /** 少於此字數就不顯示展開按鈕 */
  threshold?: number;
}

/** 純文字「摘要 → 展開全文」：只做 UI 收合，不截斷資料 */
export function GroupBuyExpandableText({
  text,
  clampClass = "line-clamp-4",
  moreLabel = "查看更多",
  lessLabel = "收合",
  className,
  threshold = 120,
}: Props) {
  const [open, setOpen] = useState(false);
  const needsToggle = text.trim().length > threshold;

  return (
    <div>
      <p
        className={cn(
          "whitespace-pre-line",
          className,
          needsToggle && !open ? clampClass : undefined,
        )}
      >
        {text}
      </p>
      {needsToggle && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4 min-h-[44px] py-2"
        >
          {open ? lessLabel : moreLabel}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      )}
    </div>
  );
}

export default GroupBuyExpandableText;
