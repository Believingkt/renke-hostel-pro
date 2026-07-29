import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X, LayoutGrid, Images } from "lucide-react";

interface Photo {
  id: string;
  photo_url: string;
  title?: string | null;
}

interface Props {
  photos: Photo[];
  startIndex?: number;
  accommodationName: string;
  /** 開啟時直接顯示全部照片格狀檢視 */
  startInGrid?: boolean;
  onClose: () => void;
}

/** 全螢幕圖片瀏覽器：單張大圖 + 左右切換 + 縮圖列 + 全部照片格狀檢視 */
const VillaPhotoLightbox = ({ photos, startIndex = 0, accommodationName, startInGrid = false, onClose }: Props) => {
  const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), Math.max(photos.length - 1, 0)));
  const [gridMode, setGridMode] = useState(startInGrid);
  const thumbRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  const prev = () => setIndex((i) => (i - 1 + photos.length) % photos.length);
  const next = () => setIndex((i) => (i + 1) % photos.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length]);

  // 縮圖自動捲到目前這張
  useEffect(() => {
    const el = thumbRef.current?.querySelector<HTMLElement>(`[data-idx="${index}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [index]);

  if (photos.length === 0) return null;
  const current = photos[index];

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col" role="dialog" aria-modal="true">
      {/* 頂部列 */}
      <div className="flex items-center justify-between px-3 py-2 md:px-5 md:py-3 text-white shrink-0">
        <span className="text-sm md:text-base tabular-nums opacity-90">
          {gridMode ? `${photos.length} 張照片` : `${index + 1} / ${photos.length}`}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setGridMode((v) => !v)}
            className="flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 px-3 py-1.5 text-sm transition-colors"
            aria-label={gridMode ? "單張檢視" : "全部照片"}
          >
            {gridMode ? <Images className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            <span className="hidden sm:inline">{gridMode ? "單張檢視" : "全部照片"}</span>
          </button>
          <button
            onClick={onClose}
            className="h-9 w-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            aria-label="關閉"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {gridMode ? (
        <div className="flex-1 overflow-y-auto px-3 pb-6 md:px-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3 max-w-6xl mx-auto">
            {photos.map((p, i) => (
              <button
                key={p.id}
                onClick={() => {
                  setIndex(i);
                  setGridMode(false);
                }}
                className="relative aspect-[4/3] overflow-hidden rounded-lg group"
              >
                <img
                  src={p.photo_url}
                  alt={p.title || `${accommodationName} - ${i + 1}`}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* 大圖 */}
          <div
            className="relative flex-1 min-h-0 flex items-center justify-center select-none"
            onTouchStart={(e) => (touchStartX.current = e.touches[0].clientX)}
            onTouchEnd={(e) => {
              const start = touchStartX.current;
              touchStartX.current = null;
              if (start === null) return;
              const dx = e.changedTouches[0].clientX - start;
              if (Math.abs(dx) > 50) (dx > 0 ? prev : next)();
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
          >
            <img
              src={current.photo_url}
              alt={current.title || `${accommodationName} - ${index + 1}`}
              draggable={false}
              className="max-w-[94vw] max-h-full object-contain"
            />

            {photos.length > 1 && (
              <>
                <button
                  onClick={prev}
                  aria-label="上一張"
                  className="absolute left-2 md:left-5 top-1/2 -translate-y-1/2 h-10 w-10 md:h-12 md:w-12 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white transition-colors"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  onClick={next}
                  aria-label="下一張"
                  className="absolute right-2 md:right-5 top-1/2 -translate-y-1/2 h-10 w-10 md:h-12 md:w-12 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white transition-colors"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </div>

          {/* 縮圖列 */}
          {photos.length > 1 && (
            <div ref={thumbRef} className="shrink-0 flex gap-2 overflow-x-auto no-scrollbar px-3 py-3 md:px-6">
              {photos.map((p, i) => (
                <button
                  key={p.id}
                  data-idx={i}
                  onClick={() => setIndex(i)}
                  className={`relative shrink-0 h-14 w-20 md:h-16 md:w-24 overflow-hidden rounded-md transition-all ${
                    i === index ? "ring-2 ring-white opacity-100" : "opacity-55 hover:opacity-85"
                  }`}
                >
                  <img
                    src={p.photo_url}
                    alt={p.title || `${accommodationName} 縮圖 ${i + 1}`}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>,
    document.body,
  );
};

export default VillaPhotoLightbox;
