import { Card, CardContent } from "@/components/ui/card";
import { Mountain, Sparkles, Clock3, Shield, Wifi, ParkingCircle, Clock, Coffee } from "lucide-react";

interface AboutSectionProps {
  description?: string;
}

const AboutSection = ({ description = "森山寫造位於寧靜的山區，是一處結合日式傳統美學與現代舒適的精品旅宿。 在這裡，您可以遠離都市喧囂，沉浸在大自然的懷抱中，享受一段悠閒的時光。" }: AboutSectionProps) => {
  return (
    <section className="py-12 md:py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3 md:mb-4">旅宿介紹</h2>
          <p className="text-center text-muted-foreground mb-8 md:mb-16 text-base md:text-lg">
            {description}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8 md:mb-16">
            {[
              { icon: Mountain, title: "山林環抱", desc: "坐落於群山之間，遠離喧囂，享受大自然的靜謐" },
              { icon: Sparkles, title: "日式美學", desc: "融合傳統日式設計與現代舒適，打造獨特住宿體驗" },
              { icon: Clock3, title: "全天服務", desc: "24小時貼心服務，隨時為您提供協助與支援" },
              { icon: Shield, title: "安心保障", desc: "完善的安全設施與衛生標準，讓您住得安心" },
            ].map((item, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow border bg-card">
                <CardContent className="pt-4 md:pt-8 pb-4 md:pb-6 text-center">
                  <div className="w-14 h-14 md:w-20 md:h-20 mx-auto mb-3 md:mb-6 rounded-full bg-green-50 flex items-center justify-center">
                    <item.icon className="h-7 w-7 md:h-10 md:w-10 text-green-600" strokeWidth={1.5} />
                  </div>
                  <h3 className="font-bold text-base md:text-lg mb-2 md:mb-3 text-foreground">{item.title}</h3>
                  <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-6 md:gap-8">
            <div>
              <h3 className="font-semibold text-lg md:text-xl mb-4 md:mb-6 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                設施與服務
              </h3>
              <div className="grid grid-cols-2 gap-3 md:gap-4">
                {[
                  { icon: Wifi, text: "免費無線網路" },
                  { icon: ParkingCircle, text: "免費停車場" },
                  { icon: Clock, text: "24小時櫃台服務" },
                  { icon: Coffee, text: "迎賓茶水服務" },
                ].map((item, index) => (
                  <div key={index} className="flex items-center gap-2 md:gap-3 p-2 md:p-3 rounded-lg hover:bg-primary/5 transition-colors">
                    <item.icon className="h-4 w-4 md:h-5 md:w-5 text-primary flex-shrink-0" />
                    <span className="text-xs md:text-sm">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
