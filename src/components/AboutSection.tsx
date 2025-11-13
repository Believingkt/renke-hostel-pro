import { Card, CardContent } from "@/components/ui/card";
import { Mountain, Sparkles, UserCheck, Camera } from "lucide-react";

interface AboutSectionProps {
  description?: string;
}

const AboutSection = ({ description = "園區坐落於群山下，在砂紋蜿蜒的庭園中，遇見一座靜心園林。以「一泊二食，全區獨享」的隱奢理念為起點，誠摯邀請您展開一場自然、舒眠與慢活的豪華露營體驗。" }: AboutSectionProps) => {
  return (
    <section className="py-12 md:py-16 lg:py-20 bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-3xl lg:text-4xl font-bold text-center mb-3 md:mb-3 lg:mb-4">自然中的秘境 X 宿泊空間</h2>
          <p className="text-center text-muted-foreground text-base md:text-base lg:text-lg mb-8 md:mb-12 lg:mb-16 whitespace-pre-line max-w-3xl mx-auto">
            {description}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
            {[
              { icon: Mountain, title: "山林環抱", desc: "坐落於群山之間，遠離喧囂，享受大自然的靜謐" },
              { icon: Sparkles, title: "日式美學", desc: "融合傳統日式設計與現代舒適，打造獨特住宿體驗" },
              { icon: UserCheck, title: "管家服務", desc: "客製化的管家服務，一天僅接待 1 組貴賓" },
              { icon: Camera, title: "寫真棚拍", desc: "森山寫照用專業攝影替您紀錄珍貴的親友相聚時光" },
            ].map((item, index) => (
              <Card key={index} className="hover:shadow-lg transition-all duration-300 border border-border/50 bg-card">
                <CardContent className="p-5 md:p-6 lg:p-8 text-center">
                  <div className="w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 mx-auto mb-3 md:mb-4 lg:mb-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <item.icon className="h-8 w-8 md:h-10 md:w-10 lg:h-12 lg:w-12 text-primary" strokeWidth={1.5} />
                  </div>
                  <h3 className="font-semibold text-base md:text-lg lg:text-xl mb-2 md:mb-2 lg:mb-3 text-foreground">{item.title}</h3>
                  <p className="text-xs md:text-sm lg:text-base text-muted-foreground leading-relaxed">{item.desc}</p>
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
