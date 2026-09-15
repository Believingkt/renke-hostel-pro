import { Check, Images } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  facilities: string[];
  /** 全部照片數（僅用於引導至下方完整相簿） */
  totalPhotos: number;
  onViewAll: () => void;
}

/**
 * 方案與日期之間的「住宿亮點」小區塊：
 * 僅呈現最多 6 項核心特色文字，照片一律由首屏 Hero 與下方完整相簿負責，避免重複。
 */
export function GroupBuyQuickPreview({ facilities, totalPhotos, onViewAll }: Props) {
  const highlights = facilities.slice(0, 6);
  if (highlights.length === 0) return null;

  return (
    <section className="mt-10 rounded-3xl border border-border/70 bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.125rem] font-bold tracking-tight sm:text-xl">住宿亮點</h2>
        {totalPhotos > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 rounded-full px-3 text-sm text-primary hover:bg-primary/10"
            onClick={onViewAll}
          >
            <Images className="mr-1.5 h-4 w-4" />
            查看全部 {totalPhotos} 張照片
          </Button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
        {highlights.map((f) => (
          <span key={f} className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="leading-snug">{f}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

export default GroupBuyQuickPreview;
