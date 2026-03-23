import { Check, Utensils } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Facility {
  id: string;
  facility_name: string;
  category: string;
  pricing_type?: string;
}

interface FacilitiesSectionProps {
  facilities: Facility[];
  customTitle?: string;
  customSubtitle?: string;
}

const FacilitiesSection = ({ facilities, customTitle, customSubtitle }: FacilitiesSectionProps) => {
  // 沒有資料時直接隱藏
  if (!facilities || facilities.length === 0) {
    return null;
  }

  // 按類別分組設施
  const groupedFacilities = facilities.reduce((acc, facility) => {
    if (!acc[facility.category]) {
      acc[facility.category] = [];
    }
    acc[facility.category].push(facility);
    return acc;
  }, {} as Record<string, Facility[]>);

  const categoryNames: Record<string, string> = {
    'public': '公共區設施服務',
    'dining': '餐飲設施',
    'safety': '安全設施',
    'entertainment': '休閒娛樂設施',
    'language': '服務語言'
  };

  return (
    <section id="facilities" className="py-12 md:py-16 lg:py-20 bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-10 md:mb-12 lg:mb-16">
          <h2 className="text-3xl md:text-3xl lg:text-4xl font-bold text-center mb-3 md:mb-3 lg:mb-4">{customTitle || '設施服務'}</h2>
          <p className="text-center text-muted-foreground mb-0 text-base md:text-base lg:text-lg max-w-3xl mx-auto">{customSubtitle || '完善設施與貼心服務，讓您的住宿體驗更加舒適'}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 lg:gap-6 max-w-6xl mx-auto">
          {Object.entries(groupedFacilities).map(([category, items]) => (
            <Card key={category} className="hover:shadow-lg transition-all duration-300 border border-border/50 bg-card">
              <CardContent className="p-5 md:p-6 lg:p-7">
                <h3 className="text-base md:text-lg lg:text-xl font-semibold mb-3 md:mb-4 lg:mb-4 text-foreground">
                  {categoryNames[category] || category}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
                  {items.map((facility) => (
                    <div key={facility.id} className="flex items-start gap-2">
                      <Check className="h-4 w-4 md:h-4 md:w-4 lg:h-5 lg:w-5 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <span className="text-xs md:text-sm lg:text-sm text-foreground">{facility.facility_name}</span>
                        {facility.pricing_type && facility.pricing_type !== 'included' && (
                          <span className="text-sm text-muted-foreground block">
                            ({facility.pricing_type === 'free' ? '免費提供' : '需額外付費'})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FacilitiesSection;
