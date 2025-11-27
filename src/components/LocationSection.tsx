import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Car, Bus } from "lucide-react";

interface LocationSectionProps {
  address: string;
  locationInfo?: {
    location_description?: string;
    driving_info?: string;
    public_transport_info?: string;
    airport_pickup_info?: string;
    nearby_attractions?: Array<{
      name: string;
      distance: string;
      description: string;
    }>;
  };
}

const LocationSection = ({ address, locationInfo }: LocationSectionProps) => {
  // 使用数据库中的数据，如果没有则使用默认值
  const nearbyAttractions = locationInfo?.nearby_attractions || [
    {
      name: "東埔溫泉",
      distance: "步行5分鐘",
      description: "著名的碳酸氫鈉泉，有美人湯之稱"
    },
    {
      name: "彩虹瀑布",
      distance: "開車15分鐘",
      description: "晨光照射時可見彩虹，景色壯觀"
    },
    {
      name: "八通關古道",
      distance: "開車10分鐘",
      description: "歷史悠久的登山古道，適合健行愛好者"
    }
  ];

  return (
    <section id="location" className="py-12 md:py-16 lg:py-20 bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-3xl lg:text-4xl font-bold text-center mb-3 md:mb-3 lg:mb-4">交通地圖</h2>
          <p className="text-center text-muted-foreground text-base md:text-base lg:text-lg mb-8 md:mb-12 lg:mb-16 max-w-3xl mx-auto">
            多種交通方式輕鬆抵達，讓您的旅程更加便利
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 lg:gap-6 mb-5 md:mb-6 lg:mb-8">
            {/* 左側 - 位置資訊 */}
            <Card className="hover:shadow-lg transition-all duration-300 border border-border/50 bg-card">
              <CardContent className="p-5 md:p-5 lg:p-6">
                <h3 className="font-semibold text-base md:text-lg lg:text-xl mb-3 md:mb-4 flex items-center gap-2 text-foreground">
                  <MapPin className="h-4 w-4 md:h-5 md:w-5 lg:h-5 lg:w-5 text-primary" />
                  位置資訊
                </h3>
                <div className="h-[280px] md:h-[400px] lg:h-[600px] bg-muted rounded-lg overflow-hidden">
                  <iframe
                    src={`https://www.google.com/maps?q=${encodeURIComponent(address || "宜蘭縣冬山鄉大進三路208號")}&output=embed`}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title="旅館位置地圖"
                  />
                </div>
                <div className="flex items-start gap-2 mt-3 md:mt-4">
                  <MapPin className="h-4 w-4 md:h-4 md:w-4 lg:h-5 lg:w-5 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-xs md:text-sm lg:text-sm font-medium text-foreground">{address || "台灣南投縣信義鄉東埔村開高巷123號"}</p>
                </div>
                {locationInfo?.location_description && (
                  <div 
                    className="text-xs md:text-sm lg:text-sm text-muted-foreground ml-6 md:ml-6 lg:ml-7 mt-1 prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: locationInfo.location_description }}
                  />
                )}
              </CardContent>
            </Card>

            {/* 右側 - 交通方式 */}
            <div className="space-y-4 md:space-y-5 lg:space-y-6">
              {/* 自行開車 */}
              <Card className="hover:shadow-lg transition-all duration-300 border border-border/50 bg-card">
                <CardContent className="p-5 md:p-5 lg:p-6">
                  <h3 className="font-semibold text-base md:text-lg lg:text-xl mb-3 md:mb-4 flex items-center gap-2 text-foreground">
                    <Car className="h-4 w-4 md:h-5 md:w-5 lg:h-6 lg:w-6 text-primary" />
                    自行開車
                  </h3>
                  <div className="space-y-3 md:space-y-4">
                    {locationInfo?.driving_info ? (
                      <div 
                        className="prose prose-sm max-w-none text-foreground/90"
                        dangerouslySetInnerHTML={{ __html: locationInfo.driving_info }}
                      />
                    ) : (
                      <>
                        <div>
                          <p className="font-semibold text-foreground mb-2 text-base">從台北出發：</p>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            國道3號 → 名間交流道 → 台16線 → 台21線 → 約3.5小時
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          旅宿提供免費停車場，無需預約
                        </p>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 大眾運輸 */}
              <Card className="hover:shadow-lg transition-all duration-300 border border-border/50 bg-card">
                <CardContent className="p-5 md:p-6">
                  <h3 className="font-semibold text-lg md:text-xl mb-4 flex items-center gap-2 text-foreground">
                    <Bus className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                    大眾運輸
                  </h3>
                  <div className="space-y-3 md:space-y-4">
                    {locationInfo?.public_transport_info ? (
                      <div 
                        className="prose prose-sm max-w-none text-foreground/90"
                        dangerouslySetInnerHTML={{ __html: locationInfo.public_transport_info }}
                      />
                    ) : (
                      <>
                        <div>
                          <p className="font-semibold text-foreground mb-2 text-base">高鐵 + 巴士：</p>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            高鐵台中站 → 轉乘南投客運 → 東埔站 → 步行約10分鐘
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          建議提前預約接駁服務（需額外付費）
                        </p>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

            </div>
          </div>

          {/* 周邊景點 */}
          <Card className="hover:shadow-lg transition-all duration-300 border border-border/50 bg-card">
            <CardContent className="p-5 md:p-6">
              <h3 className="text-lg md:text-xl font-semibold mb-5 md:mb-6 text-foreground">周邊景點</h3>
              <div className="grid md:grid-cols-3 gap-6 md:gap-8">
                {nearbyAttractions.map((attraction, index) => (
                  <div key={index}>
                    <h4 className="font-semibold text-base md:text-lg mb-2 text-foreground">{attraction.name}</h4>
                    <p className="text-xs md:text-sm text-muted-foreground mb-2">{attraction.distance}</p>
                    <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                      {attraction.description}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default LocationSection;
