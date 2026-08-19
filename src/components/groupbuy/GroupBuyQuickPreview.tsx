import { Check, Images } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  photos: string[];
  facilities: string[];
  venueName: string;
  /** 全部照片數（含未預覽的） */
  totalPhotos: number;
  onViewAll: () => void;
}

/**
 * 方案與日期之間的「住宿價值確認」小區塊：
 * 只放 2～4 張代表照片與少量核心特色，完整相簿與設備仍在下方民宿介紹。
 */
export function GroupBuyQuickPreview({ photos, facilities, venueName, totalPhotos, onViewAll }: Props) {
  const shots = photos.slice(0, 4);
  const highlights = facilities.slice(0, 6);
  if (shots.length === 0 && highlights.length === 0) return null;

  return (
    <section className="mt-10 rounded-3xl border border-border/70 bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.125rem] font-bold tracking-tight sm:text-xl">住宿環境與特色</h2>
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

      {shots.length > 0 && (
        <div className="-mx-5 mt-4 flex gap-3 overflow-x-auto px-5 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0">
          {shots.map((url, i) => (
            <button
              key={url + i}
              type="button"
              onClick={onViewAll}
              className="h-28 w-40 shrink-0 overflow-hidden rounded-xl sm:h-24 sm:w-full"
              aria-label={`查看 ${venueName} 照片`}
            >
              <img src={url} alt={`${venueName} 環境照片 ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {highlights.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
          {highlights.map((f) => (
            <span key={f} className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="leading-snug">{f}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

export default GroupBuyQuickPreview;
