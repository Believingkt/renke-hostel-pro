import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PackagePhoto {
  url: string;
  rtName: string;
}

interface Props {
  photos: PackagePhoto[];
}

const PackagePhotoCarousel = ({ photos }: Props) => {
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

  if (photos.length === 0) return null;

  return (
    <div className="relative aspect-[16/10] bg-muted overflow-hidden">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="group flex h-full w-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-smooth no-scrollbar overscroll-x-contain overscroll-y-none cursor-grab active:cursor-grabbing select-none"
        style={{ scrollbarWidth: "none", touchAction: "pan-x" }}
      >
        {photos.map((p, i) => (
          <div key={`${p.url}-${i}`} className="relative shrink-0 w-full h-full snap-start overflow-hidden">
            <img
              src={p.url}
              alt={p.rtName}
              loading={i === 0 ? "eager" : "lazy"}
              className="w-full h-full object-cover"
              draggable={false}
            />
            {p.rtName && (
              <div className="absolute bottom-2 left-2">
                <span className="bg-black/55 backdrop-blur-sm text-white text-[11px] font-semibold px-2 py-0.5 rounded-full">
                  {p.rtName}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {photos.length > 1 && (
        <>
          {/* Desktop nav: left */}
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
              <span className="h-8 w-8 flex items-center justify-center rounded-full bg-white/85 group-hover/nav:bg-white shadow-md text-foreground opacity-0 hover:opacity-100 transition-opacity">
                <ChevronLeft className="h-4 w-4" />
              </span>
            )}
          </div>
          {/* Desktop nav: right */}
          <div
            role="button"
            aria-label="下一張"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const el = scrollerRef.current;
              if (!el || activeIdx >= photos.length - 1) return;
              const idx = Math.min(photos.length - 1, Math.round(el.scrollLeft / el.clientWidth) + 1);
              el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
            }}
            className="hidden md:flex absolute right-0 top-0 bottom-0 w-14 z-20 items-center justify-end pr-2 cursor-pointer group/nav"
          >
            {activeIdx < photos.length - 1 && (
              <span className="h-8 w-8 flex items-center justify-center rounded-full bg-white/85 group-hover/nav:bg-white shadow-md text-foreground opacity-0 hover:opacity-100 transition-opacity">
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </div>

          {/* Dot indicator */}
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
        </>
      )}
    </div>
  );
};

export default PackagePhotoCarousel;
