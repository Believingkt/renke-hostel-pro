import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";

interface Photo {
  id: string;
  photo_url: string;
  title?: string | null;
}

interface Props {
  photos: Photo[];
  accommodationName: string;
}

/**
 * Villa 頁頂部圖片輪播
 * 互動方式比照搜尋頁卡片（SearchRoomCard）：
 *  - 觸控：原生橫向滑動 + snap
 *  - 桌機：滑鼠拖曳；左右 hover 區出現箭頭
 *  - 底部：小圓點頁籤（>10 張時改顯示 "n / N" 計數）
 */
const VillaPhotoCarousel = ({ photos, accommodationName }: Props) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const dragState = useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null);

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== activeIdx) setActiveIdx(idx);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = scrollerRef.current;
    if (!el) return;
    dragState.current = { startX: e.clientX, startScroll: el.scrollLeft, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragState.current;
    const el = scrollerRef.current;
    if (!s || !el) return;
    const dx = e.clientX - s.startX;
    if (Math.abs(dx) > 3) {
      s.moved = true;
      try {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      } catch {}
    }
    if (s.moved) {
      el.scrollLeft = s.startScroll - dx;
      e.preventDefault();
    }
  };
  const endDrag = () => {
    const s = dragState.current;
    const el = scrollerRef.current;
    dragState.current = null;
    if (!s || !el) return;
    if (s.moved) {
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
    }
  };

  const scrollTo = (idx: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
  };

  if (photos.length === 0) {
    return (
      <div
        className="w-full aspect-[4/3] flex items-center justify-center"
        style={{ background: "hsl(25, 60%, 95%)" }}
      >
        <ImageIcon className="h-12 w-12" style={{ color: "hsl(25, 60%, 75%)" }} />
      </div>
    );
  }

  const useCounter = photos.length > 10;

  return (
    <div className="group relative w-full aspect-[4/3] bg-muted overflow-hidden">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="flex h-full w-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-smooth no-scrollbar overscroll-x-contain overscroll-y-none cursor-grab active:cursor-grabbing select-none"
        style={{ scrollbarWidth: "none", touchAction: "pan-x" }}
      >
        {photos.map((p, i) => (
          <div key={p.id} className="relative shrink-0 w-full h-full snap-start overflow-hidden">
            <img
              src={p.photo_url}
              alt={p.title || `${accommodationName} - ${i + 1}`}
              loading={i === 0 ? "eager" : "lazy"}
              className="w-full h-full object-cover"
              draggable={false}
            />
          </div>
        ))}
      </div>

      {/* 桌機版：左右 hover 區，顯示箭頭 */}
      {photos.length > 1 && (
        <>
          <div
            role="button"
            aria-label="上一張"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (activeIdx === 0) return;
              scrollTo(Math.max(0, activeIdx - 1));
            }}
            className="hidden md:flex absolute left-0 top-0 bottom-0 w-14 z-20 items-center justify-start pl-2 cursor-pointer"
          >
            {activeIdx > 0 && (
              <span className="h-9 w-9 flex items-center justify-center rounded-full bg-white/85 hover:bg-white shadow-md text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronLeft className="h-5 w-5" />
              </span>
            )}
          </div>
          <div
            role="button"
            aria-label="下一張"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (activeIdx >= photos.length - 1) return;
              scrollTo(Math.min(photos.length - 1, activeIdx + 1));
            }}
            className="hidden md:flex absolute right-0 top-0 bottom-0 w-14 z-20 items-center justify-end pr-2 cursor-pointer"
          >
            {activeIdx < photos.length - 1 && (
              <span className="h-9 w-9 flex items-center justify-center rounded-full bg-white/85 hover:bg-white shadow-md text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight className="h-5 w-5" />
              </span>
            )}
          </div>
        </>
      )}

      {/* 右下：小圓點頁籤 / 多張時計數 */}
      {photos.length > 1 && (
        useCounter ? (
          <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full bg-black/55 backdrop-blur text-white text-xs font-medium tabular-nums pointer-events-none">
            {activeIdx + 1} / {photos.length}
          </div>
        ) : (
          <div className="absolute right-3 bottom-3 flex items-center gap-1 px-1.5 py-1 rounded-full bg-black/40 backdrop-blur-sm pointer-events-none">
            {photos.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === activeIdx ? "w-3.5 bg-white" : "w-1.5 bg-white/60"
                }`}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
};

export default VillaPhotoCarousel;
