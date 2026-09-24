import { useState } from "react";
import VillaPhotoLightbox from "@lakeze/shared/components/booking-villa/VillaPhotoLightbox";
import { cn } from "@lakeze/shared/lib/utils";

interface Props {
  urls: string[];
  alt: string;
  className?: string;
}

/**
 * 團購方案圖片區：桌機主圖 + 最多 3 格副圖（超過顯示 +N），手機主圖 + 橫向縮圖列。
 * 點擊任一張以既有的 VillaPhotoLightbox 放大（不另外實作第二套燈箱）。
 */
export function GroupBuyPackageGallery({ urls, alt, className }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const photos = (urls ?? []).filter(Boolean);
  if (photos.length === 0) return null;

  const [main, ...rest] = photos;
  const thumbs = rest.slice(0, 3);
  const overflow = rest.length - thumbs.length;

  return (
    <div className={cn("min-w-0", className)}>
      <button
        type="button"
        onClick={() => setLightboxIndex(0)}
        aria-label={`放大檢視${alt}圖片`}
        className="block w-full overflow-hidden rounded-xl"
      >
        <img
          src={main}
          alt={alt}
          loading="lazy"
          className="aspect-[4/3] w-full object-cover transition hover:scale-[1.02]"
        />
      </button>

      {thumbs.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {thumbs.map((url, i) => {
            const isLast = i === thumbs.length - 1 && overflow > 0;
            return (
              <button
                key={url}
                type="button"
                onClick={() => setLightboxIndex(isLast ? i + 2 : i + 1)}
                aria-label={isLast ? `再檢視其他 ${overflow} 張圖片` : `放大檢視第 ${i + 2} 張圖片`}
                className="relative w-full overflow-hidden rounded-lg"
              >
                <img
                  src={url}
                  alt={`${alt} ${i + 2}`}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
                {isLast && (
                  <span className="absolute inset-0 flex items-center justify-center bg-foreground/55 text-sm font-semibold text-background">
                    +{overflow}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {lightboxIndex !== null && (
        <VillaPhotoLightbox
          photos={photos.map((url, i) => ({ id: `${i}-${url}`, photo_url: url }))}
          startIndex={lightboxIndex}
          accommodationName={alt}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

export default GroupBuyPackageGallery;
