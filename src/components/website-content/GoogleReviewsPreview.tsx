import { Star, ExternalLink } from "lucide-react";

interface GoogleReviewItem {
  rating: number;
  text: string;
  authorName: string;
  authorPhoto?: string | null;
  authorUrl?: string | null;
  publishTime?: string | null;
  relativeTime?: string | null;
}

interface Props {
  reviews: GoogleReviewItem[];
  displayCount: number;
  selectedKeys: string[];
  totalReviews?: number;
  averageRating?: number | null;
  googleMapsUri?: string;
}

const reviewKey = (r: GoogleReviewItem) =>
  `${r.authorName}__${r.publishTime || ""}`;

export const GoogleReviewsPreview = ({
  reviews,
  displayCount,
  selectedKeys,
  totalReviews,
  averageRating,
  googleMapsUri,
}: Props) => {
  // 與前台 ReviewsSection 完全相同的挑選邏輯
  const picked: GoogleReviewItem[] = (() => {
    if (!reviews?.length) return [];
    if (selectedKeys.length > 0) {
      const map = new Map(reviews.map((r) => [reviewKey(r), r]));
      const ordered: GoogleReviewItem[] = [];
      for (const k of selectedKeys) {
        const r = map.get(k);
        if (r) ordered.push(r);
      }
      return ordered.slice(0, displayCount);
    }
    return [...reviews]
      .sort((a, b) => {
        const ta = a.publishTime ? new Date(a.publishTime).getTime() : 0;
        const tb = b.publishTime ? new Date(b.publishTime).getTime() : 0;
        return tb - ta;
      })
      .slice(0, displayCount);
  })();

  if (picked.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-10 text-center text-sm text-muted-foreground">
        目前沒有可顯示的評論。請至少勾選一則,或先同步 Google 評論。
      </div>
    );
  }

  const avg =
    averageRating != null
      ? averageRating.toFixed(1)
      : (
          picked.reduce((s, r) => s + r.rating, 0) / picked.length
        ).toFixed(1);
  const total = totalReviews ?? picked.length;

  return (
    <div className="rounded-xl border bg-secondary/20 p-4 md:p-6">
      <div className="text-center mb-4">
        <h3 className="text-2xl md:text-3xl font-bold mb-1">Google 評論</h3>
        <p className="text-sm text-muted-foreground mb-3">
          來自真實旅客的住宿體驗分享
        </p>
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="text-3xl md:text-4xl font-bold text-primary">
            {avg}
          </span>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={`w-5 h-5 md:w-6 md:h-6 ${
                  s <= Math.round(parseFloat(avg))
                    ? "fill-primary text-primary"
                    : "text-muted-foreground/30"
                }`}
              />
            ))}
          </div>
        </div>
        <p className="text-xs md:text-sm text-muted-foreground">
          來自 {total} 則 Google 評論
        </p>
        {googleMapsUri && (
          <a
            href={googleMapsUri}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
          >
            在 Google 地圖查看全部 <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {picked.map((r, i) => (
          <div
            key={`${reviewKey(r)}-${i}`}
            className="bg-card p-4 md:p-5 rounded-lg border border-border/50 relative"
          >
            <div className="absolute -top-2 -left-2 bg-primary text-primary-foreground text-xs font-semibold rounded-full w-6 h-6 flex items-center justify-center shadow">
              {i + 1}
            </div>
            <div className="flex items-start justify-between mb-3 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {r.authorPhoto ? (
                  <img
                    src={r.authorPhoto}
                    alt={r.authorName}
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold flex-shrink-0">
                    {r.authorName.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <h4 className="font-semibold text-sm md:text-base truncate">
                    {r.authorName}
                  </h4>
                  {(r.relativeTime || r.publishTime) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.relativeTime ||
                        new Date(r.publishTime!).toLocaleDateString("zh-TW")}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-0.5 flex-shrink-0">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={`w-4 h-4 ${
                      s <= Math.round(r.rating)
                        ? "fill-primary text-primary"
                        : "fill-muted text-muted"
                    }`}
                  />
                ))}
              </div>
            </div>
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line line-clamp-6">
              {r.text || (
                <em className="text-muted-foreground">(無文字內容)</em>
              )}
            </p>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-4">
        評論資料由 Google 提供 · 此為前台預覽
      </p>
    </div>
  );
};
