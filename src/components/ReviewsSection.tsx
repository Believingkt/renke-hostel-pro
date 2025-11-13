import { Star } from "lucide-react";

const reviews = [
  {
    name: "王啟明",
    date: "2024年10月",
    rating: 5,
    comment: "環境非常優美，房間乾淨舒適，服務人員態度親切，山景令人驚艷，是放鬆身心的好地方！"
  },
  {
    name: "李美華",
    date: "2024年9月",
    rating: 5,
    comment: "和式房間設計很有特色，融合了傳統與現代。早餐豐盛美味，附近的溫泉也很棒。會再來！"
  },
  {
    name: "張大衛",
    date: "2024年9月",
    rating: 4,
    comment: "整體住宿體驗很好，唯一小缺點是交通不太方便。但環境清幽，空氣新鮮，很值得。"
  },
  {
    name: "陳雅婷",
    date: "2024年8月",
    rating: 5,
    comment: "完美的假期！員工服務超讚，房間設施齊全，view超美。強烈推薦給想要遠離都市的朋友！"
  }
];

const ReviewsSection = () => {
  const averageRating = 4.8;
  const totalReviews = 4;

  return (
    <section className="py-12 md:py-16 lg:py-20 bg-secondary/20">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-3xl lg:text-4xl font-bold text-center mb-3 md:mb-3 lg:mb-4">旅客評價</h2>
          <p className="text-center text-muted-foreground text-base md:text-base lg:text-lg mb-8 md:mb-12 lg:mb-16 max-w-3xl mx-auto">來自真實旅客的住宿體驗分享</p>
          
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
            {reviews.map((review, index) => (
              <div
                key={index}
                className="bg-card p-5 md:p-6 lg:p-6 rounded-lg border border-border/50 hover:shadow-lg transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-3 md:mb-3 lg:mb-4">
                  <div>
                    <h3 className="font-semibold text-base md:text-base lg:text-lg">{review.name}</h3>
                    <p className="text-xs md:text-sm lg:text-sm text-muted-foreground mt-1">{review.date}</p>
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
