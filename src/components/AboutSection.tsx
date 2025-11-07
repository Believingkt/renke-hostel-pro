import { Card, CardContent } from "@/components/ui/card";
import { Mountain, Sparkles, Clock3, Shield } from "lucide-react";

interface AboutSectionProps {
  description?: string;
}

const AboutSection = ({ description = "園區坐落於群山下，在砂紋蜿蜒的庭園中，遇見一座靜心園林。以「一泊二食，全區獨享」的隱奢理念為起點，誠摯邀請您展開一場自然、舒眠與慢活的豪華露營體驗。" }: AboutSectionProps) => {
  return (
    <section className="py-12 md:py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3 md:mb-4">自然中的秘境 X 宿泊空間</h2>
          <p className="text-center text-muted-foreground text-base md:text-lg mb-8 md:mb-16 whitespace-pre-line">
            {description}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {[
              { icon: Mountain, title: "山林環抱", desc: "坐落於群山之間，遠離喧囂，享受大自然的靜謐" },
              { icon: Sparkles, title: "日式美學", desc: "融合傳統日式設計與現代舒適，打造獨特住宿體驗" },
              { icon: Clock3, title: "全天服務", desc: "24小時貼心服務，隨時為您提供協助與支援" },
              { icon: Shield, title: "安心保障", desc: "完善的安全設施與衛生標準，讓您住得安心" },
            ].map((item, index) => (
              <Card key={index} className="hover:shadow-lg transition-all duration-300 border border-border/50 bg-card">
                <CardContent className="p-6 md:p-8 text-center">
                  <div className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-4 md:mb-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <item.icon className="h-10 w-10 md:h-12 md:w-12 text-primary" strokeWidth={1.5} />
                  </div>
                  <h3 className="font-semibold text-lg md:text-xl mb-3 text-foreground">{item.title}</h3>
                  <p className="text-sm md:text-base text-muted-foreground leading-relaxed">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
