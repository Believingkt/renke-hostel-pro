import { useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

interface Props {
  /** 第一層顯示的熱門設施名稱（優先為團購頁精選特色，其次為民宿設施前幾項） */
  highlights: string[];
  /** 全部設施總項數（僅顯示用） */
  totalCount: number;
  /** 展開後顯示的完整分類內容（既有 FacilitiesSection） */
  children: ReactNode;
}

/** 團購頁「設施與服務」：第一層只顯示熱門設施，點擊後才展開完整分類 */
export function GroupBuyFacilitiesCompact({ highlights, totalCount, children }: Props) {
  const [open, setOpen] = useState(false);
  if (highlights.length === 0 && totalCount === 0) return null;

  return (
    <section className="py-8 sm:py-10">
      <div className="mx-auto w-full max-w-[1040px] px-5 sm:px-6">
        <h2 className="text-[1.375rem] font-bold tracking-tight sm:text-[1.625rem]">設施與服務</h2>
        {highlights.length > 0 && (
          <>
            <p className="mt-1 text-sm text-muted-foreground">熱門設施</p>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
              {highlights.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
                  <span className="leading-snug">{f}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {totalCount > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4"
          >
            {open ? "收合設施清單" : `查看全部 ${totalCount} 項設施`}
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}

        {open && <div className="mt-2 [&_section]:py-4">{children}</div>}
      </div>
    </section>
  );
}

export default GroupBuyFacilitiesCompact;
