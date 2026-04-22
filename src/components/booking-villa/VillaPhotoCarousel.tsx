import { useState, useEffect, useRef } from "react";
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
 * Trip.com 風格的全屏圖片輪播（手機優先）
 * - 橫向滑動（snap scroll），底部白色頁碼
 * - 全部混合（hero + gallery）
 */
const VillaPhotoCarousel = ({ photos, accommodationName }: Props) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Track scroll position to update active index
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || photos.length === 0) return;
    const handleScroll = () => {
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      setActiveIdx(idx);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [photos.length]);

  const scrollTo = (idx: number) => {
    const el = scrollRef.current;
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

  return (
    <div className="relative w-full aspect-[4/3] bg-muted overflow-hidden">
      {/* Scrollable strip */}
      <div
        ref={scrollRef}
        className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-none"
        style={{ scrollbarWidth: "none" }}
      >
        {photos.map((p, i) => (
          <div key={p.id} className="w-full h-full shrink-0 snap-center">
            <img
              src={p.photo_url}
              alt={p.title || `${accommodationName} - ${i + 1}`}
              className="w-full h-full object-cover"
              loading={i === 0 ? "eager" : "lazy"}
            />
          </div>
        ))}
      </div>

      {/* Desktop arrows (hidden on mobile) */}
      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => scrollTo(Math.max(0, activeIdx - 1))}
            className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 items-center justify-center rounded-full bg-black/40 backdrop-blur text-white hover:bg-black/60 transition disabled:opacity-30"
            disabled={activeIdx === 0}
            aria-label="上一張"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => scrollTo(Math.min(photos.length - 1, activeIdx + 1))}
            className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 items-center justify-center rounded-full bg-black/40 backdrop-blur text-white hover:bg-black/60 transition disabled:opacity-30"
            disabled={activeIdx === photos.length - 1}
            aria-label="下一張"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      {/* Counter pill (Trip.com style) */}
      {photos.length > 1 && (
        <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full bg-black/55 backdrop-blur text-white text-xs font-medium tabular-nums">
          {activeIdx + 1} / {photos.length}
        </div>
      )}
    </div>
  );
};

export default VillaPhotoCarousel;
