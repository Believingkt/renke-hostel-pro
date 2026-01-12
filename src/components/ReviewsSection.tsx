import { Star } from "lucide-react";

const reviews = [
  {
    name: "林志偉",
    date: "2025年1月",
    rating: 5,
    comment: "新年來天送住了三天兩夜，房間非常寬敞舒適，和式風格讓人身心放鬆。老闆娘準備的早餐超豐盛，每天都不一樣！窗外就是山景，早晨醒來心情超好。"
  },
  {
    name: "許雅琳",
    date: "2024年12月",
    rating: 4,
    comment: "帶父母來過聖誕節，他們非常喜歡這裡的氛圍。房間乾淨整潔，設備齊全，溫泉浴池超讚！服務人員細心親切，還幫忙推薦附近景點，下次一定再來！"
  },
  {
    name: "陳柏翰",
    date: "2024年12月",
    rating: 5,
    comment: "第一次來宜蘭就選對了民宿！天送幸福的環境清幽，遠離城市喧囂，很適合放空充電。晚上泡個舒服的澡，睡眠品質超好，隔天精神飽滿。大推！"
  },
  {
    name: "張家瑜",
    date: "2024年11月",
    rating: 5,
    comment: "和閨蜜們的輕旅行選這裡太對了！四人房空間很大，拍照超美。周邊很安靜，還可以看到星星。老闆非常熱情，還送我們當地的小點心，滿滿的人情味！"
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
