import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface Props {
  urls: string[];
  alt: string;
  /** 手機版初始顯示張數 */
  mobileInitial?: number;
}

/** 團購頁活動相簿：手機版先顯示前幾張，其餘點擊後展開 */
export function GroupBuyPhotoGrid({ urls, alt, mobileInitial = 4 }: Props) {
  const [open, setOpen] = useState(false);
  if (urls.length === 0) return null;
  const hidden = Math.max(0, urls.length - mobileInitial);

  return (
    <div className="mt-7">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {urls.map((url, i) => (
          <img
            key={url}
            src={url}
            alt={alt}
            loading="lazy"
            className={`aspect-[4/3] w-full rounded-xl object-cover ${
              !open && i >= mobileInitial ? "hidden sm:block" : ""
            }`}
          />
        ))}
      </div>
      {hidden > 0 && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4 sm:hidden"
        >
          查看全部 {urls.length} 張照片
          <ChevronDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default GroupBuyPhotoGrid;
