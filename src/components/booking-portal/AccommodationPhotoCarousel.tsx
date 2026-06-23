import { useRef, useState } from "react";
import { BedDouble, ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  photos: string[];
  alt: string;
  aspectClassName?: string;
  roundedClassName?: string;
  eager?: boolean;
  onClick?: () => void;
  /** 圖片上方/內部的 overlay 內容（例如 location badge） */
  overlay?: React.ReactNode;
}

/** 比照搜尋頁卡片：水平 snap 滑動 + drag + 桌機左右箭頭 + 底部 dots */
const AccommodationPhotoCarousel = ({
  photos,
  alt,
  aspectClassName = "aspect-[4/3]",
  roundedClassName = "rounded-xl",
  eager = false,
  onClick,
  overlay,
}: Props) => {
  const list = photos.filter(Boolean).slice(0, 8);
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
  const handleClick = (e: React.MouseEvent) => {
    if (dragState.current?.moved) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    onClick?.();
  };

  return (
    <div
      className={`relative ${aspectClassName} ${roundedClassName} overflow-hidden bg-muted ${onClick ? "cursor-pointer" : ""}`}
      onClick={handleClick}
    >
      {list.length === 0 ? (
        <div className="w-full h-full flex items-center justify-center bg-secondary">
          <BedDouble className="h-12 w-12 text-muted-foreground/40" />
        </div>
      ) : (
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
          {list.map((src, i) => (
            <div key={i} className="relative shrink-0 w-full h-full snap-start overflow-hidden">
              <img
                src={src}
                alt={`${alt} ${i + 1}`}
                loading={eager && i === 0 ? "eager" : "lazy"}
                draggable={false}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      )}

      {/* 桌機左右箭頭 */}
      {list.length > 1 && (
        <>
          <div
            role="button"
            aria-label="上一張"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const el = scrollerRef.current;
              if (!el || activeIdx === 0) return;
              const idx = Math.max(0, Math.round(el.scrollLeft / el.clientWidth) - 1);
              el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
            }}
            className="hidden md:flex absolute left-0 top-0 bottom-0 w-14 z-20 items-center justify-start pl-2 cursor-pointer group/nav"
          >
            {activeIdx > 0 && (
              <span className="h-8 w-8 flex items-center justify-center rounded-full bg-white/85 group-hover/nav:bg-white shadow-md text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronLeft className="h-4 w-4" />
              </span>
            )}
          </div>
          <div
            role="button"
            aria-label="下一張"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const el = scrollerRef.current;
              if (!el || activeIdx >= list.length - 1) return;
              const idx = Math.min(list.length - 1, Math.round(el.scrollLeft / el.clientWidth) + 1);
              el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
            }}
            className="hidden md:flex absolute right-0 top-0 bottom-0 w-14 z-20 items-center justify-end pr-2 cursor-pointer group/nav"
          >
            {activeIdx < list.length - 1 && (
              <span className="h-8 w-8 flex items-center justify-center rounded-full bg-white/85 group-hover/nav:bg-white shadow-md text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </div>
        </>
      )}

      {overlay}

      {/* 底部頁籤 */}
      {list.length > 1 && (
        <div className="absolute right-3 bottom-3 flex items-center gap-1 px-1.5 py-1 rounded-full bg-black/40 backdrop-blur-sm pointer-events-none z-10">
          {list.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === activeIdx ? "w-3.5 bg-white" : "w-1.5 bg-white/60"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default AccommodationPhotoCarousel;
