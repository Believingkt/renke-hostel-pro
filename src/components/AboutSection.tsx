import { Card, CardContent } from "@/components/ui/card";
import { Mountain, Sparkles, UserCheck, Camera } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AboutSectionProps {
  description?: string;
  accommodationId?: string;
}

const AboutSection = ({ description, accommodationId }: AboutSectionProps) => {
  const [sectionData, setSectionData] = useState({
    title: "自然中的秘境 X 宿泊空間",
    description: description || "園區坐落於群山下，在砂紋蜿蜒的庭園中，遇見一座靜心園林。以「一泊二食，全區獨享」的隱奢理念為起點，誠摯邀請您展開一場自然、舒眠與慢活的豪華露營體驗。"
  });
  const [features, setFeatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const defaultFeatures = [
    { icon: Mountain, title: "山林環抱", desc: "坐落於群山之間，遠離喧囂，享受大自然的靜謐" },
    { icon: Sparkles, title: "日式美學", desc: "融合傳統日式設計與現代舒適，打造獨特住宿體驗" },
    { icon: UserCheck, title: "管家服務", desc: "客製化的管家服務，一天僅接待 1 組貴賓" },
    { icon: Camera, title: "寫真棚拍", desc: "森山寫照用專業攝影替您紀錄珍貴的親友相聚時光" },
  ];

  useEffect(() => {
    const loadAboutSection = async () => {
      if (!accommodationId) {
        setFeatures(defaultFeatures);
        setLoading(false);
        return;
      }

      try {
        // 載入特色說明主資料
        const { data: aboutData } = await supabase
          .from("about_section")
          .select("*")
          .eq("accommodation_id", accommodationId)
          .maybeSingle();

        if (aboutData) {
          setSectionData({
            title: aboutData.section_title || "自然中的秘境 X 宿泊空間",
            description: aboutData.section_description || description || ""
          });
        } else if (description) {
          setSectionData(prev => ({ ...prev, description }));
        }

        // 載入特色區塊
        const { data: featuresData } = await supabase
          .from("about_features")
          .select("*")
          .eq("accommodation_id", accommodationId)
          .order("display_order");

        if (featuresData && featuresData.length > 0) {
          setFeatures(featuresData);
        } else {
          setFeatures(defaultFeatures);
        }
      } catch (error) {
        console.error('Error loading about section:', error);
        setFeatures(defaultFeatures);
      } finally {
        setLoading(false);
      }
    };

    loadAboutSection();
  }, [accommodationId, description]);

  if (loading) {
    return (
      <section className="py-12 md:py-16 lg:py-20 bg-background">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="h-8 bg-muted animate-pulse rounded mb-4" />
            <div className="h-20 bg-muted animate-pulse rounded mb-12" />
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-48 bg-muted animate-pulse rounded" />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const IconComponent = (iconName: string) => {
    switch (iconName) {
      case 'Mountain': return Mountain;
      case 'Sparkles': return Sparkles;
      case 'UserCheck': return UserCheck;
      case 'Camera': return Camera;
      default: return Mountain;
    }
  };

  return (
    <section className="py-12 md:py-16 lg:py-20 bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-3xl lg:text-4xl font-bold text-center mb-3 md:mb-3 lg:mb-4">
            {sectionData.title}
          </h2>
          <p className="text-center text-muted-foreground text-base md:text-base lg:text-lg mb-8 md:mb-12 lg:mb-16 max-w-3xl mx-auto">
            {sectionData.description}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
            {features.map((item, index) => {
              const Icon = item.icon || IconComponent(item.icon_name);
              return (
                <Card key={index} className="hover:shadow-lg transition-all duration-300 border border-border/50 bg-card">
                  <CardContent className="p-5 md:p-6 lg:p-8 text-center">
                    <div className="w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 mx-auto mb-3 md:mb-4 lg:mb-6 rounded-full bg-primary/10 flex items-center justify-center">
                      {item.icon_type === 'custom' && item.icon_url ? (
                        <img src={item.icon_url} alt={item.title} className="h-8 w-8 md:h-10 md:w-10 lg:h-12 lg:w-12 object-contain" loading="lazy" />
                      ) : (
                        <Icon className="h-8 w-8 md:h-10 md:w-10 lg:h-12 lg:w-12 text-primary" strokeWidth={1.5} />
                      )}
                    </div>
                    <h3 className="font-semibold text-base md:text-lg lg:text-xl mb-2 md:mb-2 lg:mb-3 text-foreground">
                      {item.title}
                    </h3>
                    <p className="text-xs md:text-sm lg:text-base text-muted-foreground leading-relaxed">
                      {item.description || item.desc}
                    </p>

                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
