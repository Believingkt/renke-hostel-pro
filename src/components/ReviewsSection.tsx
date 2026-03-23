import { Star, MessageCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ReviewsSectionProps {
  accommodationId?: string;
  customTitle?: string;
  customSubtitle?: string;
}

interface Review {
  id: string;
  reviewer_name: string;
  review_date: string;
  rating: number;
  comment: string;
}

const ReviewsSection = ({ accommodationId, customTitle, customSubtitle }: ReviewsSectionProps) => {
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['reviews', accommodationId],
    queryFn: async () => {
      if (!accommodationId) return [];
      
      const { data, error } = await supabase
        .from('reviews')
        .select('id, reviewer_name, review_date, rating, comment')
        .eq('accommodation_id', accommodationId)
        .eq('is_published', true)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error fetching reviews:', error);
        return [];
      }

      return data as Review[];
    },
    enabled: !!accommodationId,
  });

  // 計算平均評分
  const averageRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : "0";
  const totalReviews = reviews.length;

  if (isLoading) {
    return (
      <section className="py-12 md:py-16 lg:py-20 bg-secondary/20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-6xl mx-auto animate-pulse">
            <div className="h-8 bg-muted rounded w-48 mx-auto mb-4"></div>
            <div className="h-4 bg-muted rounded w-64 mx-auto mb-12"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-card p-6 rounded-lg border">
                  <div className="h-6 bg-muted rounded w-24 mb-2"></div>
                  <div className="h-4 bg-muted rounded w-full"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // 沒有資料時直接隱藏
  if (reviews.length === 0) {
    return null;
  }

  return (
    <section id="reviews" className="py-12 md:py-16 lg:py-20 bg-secondary/20">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-3xl lg:text-4xl font-bold text-center mb-3 md:mb-3 lg:mb-4">{customTitle || '旅客評價'}</h2>
          <p className="text-center text-muted-foreground text-base md:text-base lg:text-lg mb-8 md:mb-12 lg:mb-16 max-w-3xl mx-auto">{customSubtitle || '來自真實旅客的住宿體驗分享'}</p>
          
          {/* Rating Summary */}
          <div className="text-center mb-6 md:mb-7 lg:mb-8">
            <div className="flex items-center justify-center gap-2 md:gap-3 mb-2">
              <span className="text-3xl md:text-4xl lg:text-4xl font-bold text-primary">{averageRating}</span>
              <div className="flex gap-0.5 md:gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className="w-6 h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 fill-primary text-primary"
                  />
                ))}
              </div>
            </div>
            <p className="text-sm md:text-sm lg:text-base text-muted-foreground">來自 {totalReviews} 則評論</p>
          </div>

          {/* Reviews Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 lg:gap-6">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="bg-card p-5 md:p-6 lg:p-6 rounded-lg border border-border/50 hover:shadow-lg transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-3 md:mb-3 lg:mb-4">
                  <div>
                    <h3 className="font-semibold text-base md:text-base lg:text-lg">{review.reviewer_name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{review.review_date}</p>
                  </div>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-4 h-4 md:w-4 md:h-4 lg:w-5 lg:h-5 ${
                          star <= review.rating
                            ? "fill-primary text-primary"
                            : "fill-muted text-muted"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-sm md:text-sm lg:text-base text-foreground leading-relaxed">{review.comment}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ReviewsSection;