import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Car, Bus, Plane } from "lucide-react";

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
    <section id="location" className="py-12 md:py-20 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3 md:mb-4">交通 & 地圖</h2>
          <p className="text-center text-muted-foreground mb-8 md:mb-16 text-base md:text-lg">
            多種交通方式輕鬆抵達，讓您的旅程更加便利
          </p>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* 左側 - 位置資訊 */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  位置資訊
                </h3>
                <div className="aspect-video bg-muted rounded-lg overflow-hidden mb-4">
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
                <div className="flex items-start gap-2 mb-2">
                  <MapPin className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-medium">{address || "台灣南投縣信義鄉東埔村開高巷123號"}</p>
                </div>
                {locationInfo?.location_description && (
                  <p className="text-sm text-muted-foreground ml-7">
                    {locationInfo.location_description}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* 右側 - 交通方式 */}
            <div className="space-y-6">
              {/* 自行開車 */}
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <Car className="h-5 w-5 text-primary" />
                    自行開車
                  </h3>
                  <div className="space-y-2">
                    {locationInfo?.driving_info ? (
                      <p className="text-sm text-muted-foreground whitespace-pre-line">
                        {locationInfo.driving_info}
                      </p>
                    ) : (
                      <>
                        <p className="text-sm font-medium">從台北出發：</p>
                        <p className="text-sm text-muted-foreground">
                          國道3號 → 名間交流道 → 台16線 → 台21線 → 約3.5小時
                        </p>
                        <p className="text-sm text-muted-foreground">
                          旅宿提供免費停車場，無需預約
                        </p>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 大眾運輸 */}
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <Bus className="h-5 w-5 text-primary" />
                    大眾運輸
                  </h3>
                  <div className="space-y-2">
                    {locationInfo?.public_transport_info ? (
                      <p className="text-sm text-muted-foreground whitespace-pre-line">
                        {locationInfo.public_transport_info}
                      </p>
                    ) : (
                      <>
                        <p className="text-sm font-medium">高鐵 + 巴士：</p>
                        <p className="text-sm text-muted-foreground">
                          高鐵台中站 → 轉乘南投客運 → 東埔站 → 步行約10分鐘
                        </p>
                        <p className="text-sm text-muted-foreground">
                          建議提前預約接駁服務（需額外付費）
                        </p>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 機場接送 */}
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <Plane className="h-5 w-5 text-primary" />
                    機場接送
                  </h3>
                  <div className="space-y-2">
                    {locationInfo?.airport_pickup_info ? (
                      <p className="text-sm text-muted-foreground whitespace-pre-line">
                        {locationInfo.airport_pickup_info}
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground">
                          提供台中清泉崗機場接送服務，請提前3天預約
                        </p>
                        <p className="text-sm text-muted-foreground">
                          接送時間：約2小時
                        </p>
                        <p className="text-sm text-muted-foreground">
                          費用：NT$ 3,500 / 趟（4人座轎車）
                        </p>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 周邊景點 */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-2xl font-bold mb-6">周邊景點</h3>
              <div className="grid md:grid-cols-3 gap-8">
                {nearbyAttractions.map((attraction, index) => (
                  <div key={index}>
                    <h4 className="font-semibold text-lg mb-2">{attraction.name}</h4>
                    <p className="text-sm text-muted-foreground mb-2">{attraction.distance}</p>
                    <p className="text-sm text-muted-foreground">
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
