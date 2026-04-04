import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Search } from "lucide-react";
import { useState, useMemo } from "react";
import { PreloadLink } from "@/components/PreloadLink";
import AccommodationLogo from "@/components/AccommodationLogo";

// Define section navigation config
const SECTION_NAV_CONFIG: Record<string, { sectionId: string; label: string }> = {
  about: { sectionId: 'about', label: '關於我們' },
  rooms: { sectionId: 'rooms', label: '房型導覽' },
  facilities: { sectionId: 'facilities', label: '設施服務' },
  gallery: { sectionId: 'gallery', label: '精選照片' },
  location: { sectionId: 'location', label: '交通地圖' },
  booking_info: { sectionId: 'booking-info', label: '訂房須知' },
  reviews: { sectionId: 'reviews', label: '旅客評價' },
  faq: { sectionId: 'faq', label: '常見問題' },
};

interface SectionVisibility {
  show_about_section?: boolean;
  show_rooms_section?: boolean;
  show_facilities_section?: boolean;
  show_gallery_section?: boolean;
  show_location_section?: boolean;
  show_booking_info_section?: boolean;
  show_reviews_section?: boolean;
  show_faq_section?: boolean;
  show_custom_images_section?: boolean;
}

interface NavigationProps {
  accommodationName?: string;
  onNavigate: (sectionId: string) => void;
  sectionsOrder?: string[];
  sectionVisibility?: SectionVisibility;
}

const Navigation = ({ 
  accommodationName = "", 
  onNavigate,
  sectionsOrder = ['about', 'rooms', 'facilities', 'gallery', 'location', 'booking_info', 'reviews', 'faq'],
  sectionVisibility = {}
}: NavigationProps) => {
  const [open, setOpen] = useState(false);

  const handleNavigate = (sectionId: string) => {
    onNavigate(sectionId);
    setOpen(false);
  };

  // Build visible navigation items based on order and visibility
  const visibleNavItems = useMemo(() => {
    const visibilityMap: Record<string, boolean | undefined> = {
      about: sectionVisibility.show_about_section,
      rooms: sectionVisibility.show_rooms_section,
      facilities: sectionVisibility.show_facilities_section,
      gallery: sectionVisibility.show_gallery_section,
      location: sectionVisibility.show_location_section,
      booking_info: sectionVisibility.show_booking_info_section,
      reviews: sectionVisibility.show_reviews_section,
      faq: sectionVisibility.show_faq_section,
    };

    return sectionsOrder
      .filter(key => {
        const config = SECTION_NAV_CONFIG[key];
        if (!config) return false;
        // Default to true if visibility is undefined
        return visibilityMap[key] !== false;
      })
      .map(key => SECTION_NAV_CONFIG[key]);
  }, [sectionsOrder, sectionVisibility]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <button onClick={() => onNavigate("home")} className="flex items-center hover:opacity-80 transition-opacity">
          <AccommodationLogo
            variant="header"
            accommodationName={accommodationName}
          />
        </button>
        
        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-2 lg:gap-4 xl:gap-6">
          {visibleNavItems.map(({ sectionId, label }) => (
            <button 
              key={sectionId}
              onClick={() => onNavigate(sectionId)} 
              className="text-xs lg:text-sm hover:text-primary transition-colors whitespace-nowrap px-1 lg:px-2"
            >
              {label}
            </button>
          ))}
          <PreloadLink to="/order-search">
            <Button variant="outline" className="text-xs lg:text-sm h-8 lg:h-10 px-3 lg:px-4">
              <Search className="h-3 w-3 lg:h-4 lg:w-4 mr-1 lg:mr-2" />
              查詢訂單
            </Button>
          </PreloadLink>
          <PreloadLink to="/book">
            <Button className="bg-primary hover:bg-primary/90 text-xs lg:text-sm h-8 lg:h-10 px-3 lg:px-4">
              立即預訂
            </Button>
          </PreloadLink>
        </nav>

        {/* Mobile Navigation */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon" className="w-12 h-12 hover:bg-transparent active:bg-transparent">
              <Menu className="h-20 w-20 text-foreground" strokeWidth={2.5} />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:w-[400px] p-0">
            <div className="flex flex-col h-full">
              {/* 選單項目 */}
              <nav className="flex-1 flex flex-col px-6 pt-20">
                {visibleNavItems.map(({ sectionId, label }) => (
                  <button 
                    key={sectionId}
                    onClick={() => handleNavigate(sectionId)} 
                    className="text-lg font-medium text-foreground hover:text-primary transition-colors text-left py-4 border-b border-border/50"
                  >
                    {label}
                  </button>
                ))}
              </nav>
              
              {/* 底部按鈕 */}
              <div className="p-6 space-y-3">
                <PreloadLink to="/order-search" className="block">
                  <Button 
                    variant="outline"
                    className="w-full h-12 text-base font-medium rounded-lg"
                    onClick={() => setOpen(false)}
                  >
                    <Search className="h-4 w-4 mr-2" />
                    查詢訂單
                  </Button>
                </PreloadLink>
                <PreloadLink to="/booking" className="block">
                  <Button 
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-base font-medium rounded-lg shadow-lg"
                    onClick={() => setOpen(false)}
                  >
                    立即預訂
                  </Button>
                </PreloadLink>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};

export default Navigation;