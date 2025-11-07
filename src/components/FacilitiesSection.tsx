import { Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Facility {
  id: string;
  facility_name: string;
  category: string;
  pricing_type?: string;
}

interface FacilitiesSectionProps {
  facilities: Facility[];
}

const FacilitiesSection = ({ facilities }: FacilitiesSectionProps) => {
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
    'public': '公共區設施與服務',
    'dining': '餐飲設施',
    'safety': '安全設施',
    'entertainment': '休閒娛樂設施',
    'language': '服務語言'
  };

  return (
    <section id="facilities" className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">設施與服務</h2>
          <p className="text-muted-foreground">完善設施與貼心服務，讓您的住宿體驗更加舒適</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto">
          {Object.entries(groupedFacilities).map(([category, items]) => (
            <Card key={category}>
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold mb-4">
                  {categoryNames[category] || category}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {items.map((facility) => (
                    <div key={facility.id} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <span className="text-sm">{facility.facility_name}</span>
                        {facility.pricing_type && facility.pricing_type !== 'included' && (
                          <span className="text-xs text-muted-foreground block">
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
