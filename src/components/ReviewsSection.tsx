import { Star, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ReviewsSectionProps {
  accommodationId?: string;
  customTitle?: string;
  customSubtitle?: string;
}

interface LocalReview {
  id: string;
  reviewer_name: string;
  review_date: string;
  rating: number;
  comment: string;
}

interface GoogleReviewItem {
  rating: number;
  text: string;
  authorName: string;
  authorPhoto?: string | null;
  authorUrl?: string | null;
  publishTime?: string | null;
  relativeTime?: string | null;
}

interface GoogleCache {
  placeId: string;
  name?: string;
  rating?: number | null;
  totalReviews?: number;
  googleMapsUri?: string;
  reviews?: GoogleReviewItem[];
}

const STALE_MS = 24 * 60 * 60 * 1000; // 24h

const ReviewsSection = ({ accommodationId, customTitle, customSubtitle }: ReviewsSectionProps) => {
  // 1. 先讀 accommodation_info 的 Google 評論快取
  const { data: googleData } = useQuery({
    queryKey: ['google-reviews', accommodationId],
    queryFn: async () => {
      if (!accommodationId) return null;
      const { data } = await supabase
        .from('accommodation_info')
        .select('google_place_id, google_reviews_cache, google_reviews_cached_at, google_reviews_display_count, google_reviews_selected_keys')
        .eq('id', accommodationId)
        .maybeSingle();

      if (!data?.google_place_id) return null;

      const cache = (data.google_reviews_cache as unknown as GoogleCache) || null;
      const cachedAt = data.google_reviews_cached_at
        ? new Date(data.google_reviews_cached_at).getTime()
        : 0;

      const displayCount = ((data as any).google_reviews_display_count ?? 5) as number;
      const selectedKeys = Array.isArray((data as any).google_reviews_selected_keys)
        ? ((data as any).google_reviews_selected_keys as string[])
        : [];

      const isStale = !cache || Date.now() - cachedAt > STALE_MS;

      let finalCache = cache;
      // 過期就背景觸發 refresh,但仍先回傳當前快取(若有)避免閃爍
      if (isStale) {
        try {
          const { data: refreshed } = await supabase.functions.invoke(
            'fetch-google-reviews',
            { body: { accommodationId, force: false } }
          );
          if (refreshed?.data) {
            finalCache = refreshed.data as GoogleCache;
          }
        } catch (err) {
          if (import.meta.env.DEV) console.warn('Google reviews refresh failed', err);
        }
      }

      return { cache: finalCache, displayCount, selectedKeys };
    },
    enabled: !!accommodationId,
    staleTime: 5 * 60 * 1000,
  });

  const googleCache = googleData?.cache ?? null;
  const displayCount = googleData?.displayCount ?? 5;
  const selectedKeys = googleData?.selectedKeys ?? [];

  // 2. 沒有 Google 評論時回退到本地 reviews 表
  const { data: localReviews = [] } = useQuery({
    queryKey: ['reviews', accommodationId],
    queryFn: async () => {
      if (!accommodationId) return [];
      const { data, error } = await supabase
        .from('reviews')
        .select('id, reviewer_name, review_date, rating, comment')
        .eq('accommodation_id', accommodationId)
        .eq('is_published', true)
        .order('display_order', { ascending: true });
      if (error) return [];
      return data as LocalReview[];
    },
    enabled: !!accommodationId && !googleCache?.reviews?.length,
  });

  const useGoogle = !!googleCache?.reviews?.length;

  // 依後台精選/排序 + 顯示數量篩選 Google 評論
  const reviewKey = (r: GoogleReviewItem) =>
    `${r.authorName}__${r.publishTime || ''}`;
  const pickedGoogleReviews: GoogleReviewItem[] = useGoogle
    ? (() => {
        const all = googleCache!.reviews!;
        if (selectedKeys.length > 0) {
          // 依後台選擇順序
          const map = new Map(all.map((r) => [reviewKey(r), r]));
          const ordered: GoogleReviewItem[] = [];
          for (const k of selectedKeys) {
            const r = map.get(k);
            if (r) ordered.push(r);
          }
          return ordered.slice(0, displayCount);
        }
        // 未精選 → 依最新排序前 N 則
        return [...all]
          .sort((a, b) => {
            const ta = a.publishTime ? new Date(a.publishTime).getTime() : 0;
            const tb = b.publishTime ? new Date(b.publishTime).getTime() : 0;
            return tb - ta;
          })
          .slice(0, displayCount);
      })()
    : [];

  const items: Array<{
    id: string;
    name: string;
    date: string;
    rating: number;
    comment: string;
    photo?: string | null;
    authorUrl?: string | null;
  }> = useGoogle
    ? pickedGoogleReviews.map((r, i) => ({
        id: `g-${i}`,
        name: r.authorName,
        date: r.relativeTime || (r.publishTime ? new Date(r.publishTime).toLocaleDateString('zh-TW') : ''),
        rating: r.rating,
        comment: r.text,
        photo: r.authorPhoto,
        authorUrl: r.authorUrl,
      }))
    : localReviews.map((r) => ({
        id: r.id,
        name: r.reviewer_name,
        date: r.review_date,
        rating: r.rating,
        comment: r.comment,
      }));

  if (items.length === 0) return null;

  const averageRating = useGoogle && googleCache?.rating != null
    ? googleCache.rating.toFixed(1)
    : (items.reduce((s, r) => s + r.rating, 0) / items.length).toFixed(1);
  const totalCount = useGoogle ? (googleCache?.totalReviews ?? items.length) : items.length;

  return (
    <section id="reviews" className="py-12 md:py-16 lg:py-20 bg-secondary/20">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-3xl lg:text-4xl font-bold text-center mb-3 md:mb-3 lg:mb-4">
            {customTitle || (useGoogle ? 'Google 評論' : '旅客評價')}
          </h2>
          <p className="text-center text-muted-foreground text-base md:text-base lg:text-lg mb-8 md:mb-12 lg:mb-16 max-w-3xl mx-auto">
            {customSubtitle || '來自真實旅客的住宿體驗分享'}
          </p>

          {/* Rating Summary */}
          <div className="text-center mb-6 md:mb-7 lg:mb-8">
            <div className="flex items-center justify-center gap-2 md:gap-3 mb-2">
              <span className="text-3xl md:text-4xl lg:text-4xl font-bold text-primary">{averageRating}</span>
              <div className="flex gap-0.5 md:gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-6 h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 ${
                      star <= Math.round(parseFloat(averageRating))
                        ? 'fill-primary text-primary'
                        : 'text-muted-foreground/30'
                    }`}
                  />
                ))}
              </div>
            </div>
            <p className="text-sm md:text-sm lg:text-base text-muted-foreground">
              來自 {totalCount} 則{useGoogle ? ' Google ' : ''}評論
            </p>
            {useGoogle && googleCache?.googleMapsUri && (
              <a
                href={googleCache.googleMapsUri}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2"
              >
                在 Google 地圖查看全部 <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 lg:gap-6">
            {items.map((review) => (
              <div
                key={review.id}
                className="bg-card p-5 md:p-6 lg:p-6 rounded-lg border border-border/50 hover:shadow-lg transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-3 md:mb-3 lg:mb-4 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {review.photo ? (
                      <img
                        src={review.photo}
                        alt={review.name}
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold flex-shrink-0">
                        {review.name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="font-semibold text-base md:text-base lg:text-lg truncate">{review.name}</h3>
                      {review.date && (
                        <p className="text-sm text-muted-foreground mt-0.5">{review.date}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-0.5 flex-shrink-0">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-4 h-4 md:w-4 md:h-4 lg:w-5 lg:h-5 ${
                          star <= review.rating
                            ? 'fill-primary text-primary'
                            : 'fill-muted text-muted'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-sm md:text-sm lg:text-base text-foreground leading-relaxed whitespace-pre-line line-clamp-6">
                  {review.comment}
                </p>
              </div>
            ))}
          </div>

          {useGoogle && (
            <p className="text-center text-xs text-muted-foreground mt-6">
              評論資料由 Google 提供
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

export default ReviewsSection;
