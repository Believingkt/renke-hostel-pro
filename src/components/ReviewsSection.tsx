import { Star } from "lucide-react";

const reviews = [
  {
    name: "王小明",
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
    <section className="py-12 md:py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4 md:mb-6">旅客評價</h2>
          
          {/* Rating Summary */}
          <div className="text-center mb-8 md:mb-12">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-4xl md:text-5xl font-bold text-primary">{averageRating}</span>
              <div className="flex gap-0.5 md:gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className="w-6 h-6 md:w-8 md:h-8 fill-primary text-primary"
                  />
                ))}
              </div>
            </div>
            <p className="text-sm md:text-base text-muted-foreground">來自 {totalReviews} 則評論</p>
          </div>

          {/* Reviews Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {reviews.map((review, index) => (
              <div
                key={index}
                className="bg-card p-4 md:p-6 rounded-lg border border-border hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-3 md:mb-4">
                  <div>
                    <h3 className="font-semibold text-base md:text-lg">{review.name}</h3>
                    <p className="text-xs md:text-sm text-muted-foreground">{review.date}</p>
                  </div>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-4 h-4 md:w-5 md:h-5 ${
                          star <= review.rating
                            ? "fill-primary text-primary"
                            : "fill-muted text-muted"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-sm md:text-base text-foreground leading-relaxed">{review.comment}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ReviewsSection;
