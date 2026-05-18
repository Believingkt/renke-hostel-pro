import { useState, useRef, useEffect } from "react";
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
  customTitle?: string;
  customSubtitle?: string;
}

const categoryNames: Record<string, string> = {
  public: "公共區設施服務",
  dining: "餐飲設施",
  safety: "安全設施",
  entertainment: "休閒娛樂設施",
  language: "服務語言",
};

const shortCategoryNames: Record<string, string> = {
  public: "公共設施",
  dining: "餐飲",
  safety: "安全",
  entertainment: "休閒娛樂",
  language: "服務語言",
};

const FacilitiesSection = ({ facilities, customTitle, customSubtitle }: FacilitiesSectionProps) => {
  if (!facilities || facilities.length === 0) return null;

  // 按類別分組
  const grouped = facilities.reduce((acc, f) => {
    (acc[f.category] ||= []).push(f);
    return acc;
  }, {} as Record<string, Facility[]>);

  const categoryKeys = Object.keys(grouped);
  const [activeCat, setActiveCat] = useState(categoryKeys[0]);
  const tabsRef = useRef<HTMLDivElement>(null);

  // 切換類別時，將 active tab 滾入視野
  useEffect(() => {
    const container = tabsRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLButtonElement>(`[data-cat="${activeCat}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeCat]);

  const activeItems = grouped[activeCat] || [];

  return (
    <section id="facilities" className="py-12 md:py-16 lg:py-20 bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-8 md:mb-12 lg:mb-16">
          <h2 className="text-3xl md:text-3xl lg:text-4xl font-bold mb-3 md:mb-3 lg:mb-4">
            {customTitle || "設施服務"}
          </h2>
          <p className="text-muted-foreground text-base md:text-base lg:text-lg max-w-3xl mx-auto">
            {customSubtitle || "完善設施與貼心服務，讓您的住宿體驗更加舒適"}
          </p>
        </div>

        {/* === 手機版：分頁網格 === */}
        <div className="md:hidden max-w-md mx-auto">
          <Card className="border border-border/50 bg-card overflow-hidden">
            {/* Tabs */}
            <div className="relative">
              <div
                ref={tabsRef}
                className="flex overflow-x-auto gap-6 px-5 border-b border-border/60 scrollbar-none"
                style={{ scrollbarWidth: "none" }}
              >
                {categoryKeys.map((cat) => {
                  const isActive = cat === activeCat;
                  return (
                    <button
                      key={cat}
                      data-cat={cat}
                      onClick={() => setActiveCat(cat)}
                      className={`relative pt-4 pb-3 text-sm font-medium whitespace-nowrap transition-colors ${
                        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {shortCategoryNames[cat] || cat}
                      {isActive && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                      )}
                    </button>
                  );
                })}
              </div>
              {/* 右側淡出遮罩 */}
              <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-card to-transparent pointer-events-none" />
            </div>

            {/* Items grid */}
            <CardContent className="p-5">
              <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                {activeItems.map((facility) => (
                  <div key={facility.id} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" strokeWidth={2.5} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-foreground leading-tight">
                        {facility.facility_name}
                      </span>
                      {facility.pricing_type && facility.pricing_type !== "included" && (
                        <span className="text-xs text-muted-foreground block">
                          ({facility.pricing_type === "free" ? "免費" : "需付費"})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="mt-6 pt-4 border-t border-border/40 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  共 {facilities.length} 項設施服務
                </p>
                <p className="text-xs text-muted-foreground">
                  {categoryNames[activeCat] || activeCat} · {activeItems.length} 項
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* === 桌面版：保留原本卡片 === */}
        <div className="hidden md:grid md:grid-cols-2 gap-4 md:gap-5 lg:gap-6 max-w-6xl mx-auto">
          {Object.entries(grouped).map(([category, items]) => (
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
                        <span className="text-xs md:text-sm lg:text-sm text-foreground">
                          {facility.facility_name}
                        </span>
                        {facility.pricing_type && facility.pricing_type !== "included" && (
                          <span className="text-sm text-muted-foreground block">
                            ({facility.pricing_type === "free" ? "免費提供" : "需額外付費"})
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
