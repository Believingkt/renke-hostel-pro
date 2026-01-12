import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Search } from "lucide-react";
import { useState, useEffect } from "react";
import { PreloadLink } from "@/components/PreloadLink";
import sensanLogo from "@/assets/sensan-logo-10.png";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";

interface NavigationProps {
  accommodationName?: string;
  onNavigate: (sectionId: string) => void;
}

const Navigation = ({ accommodationName = "森山寫照", onNavigate }: NavigationProps) => {
  const [open, setOpen] = useState(false);
  const [headerLogoUrl, setHeaderLogoUrl] = useState<string>("");
  const { currentAccommodationId } = useAccommodation();

  useEffect(() => {
    const fetchHeaderLogo = async () => {
      if (!currentAccommodationId) return;
      
      try {
        const { data, error } = await supabase
          .from("accommodation_info")
          .select("header_logo_url")
          .eq("id", currentAccommodationId)
          .maybeSingle();

        if (!error && data?.header_logo_url) {
          setHeaderLogoUrl(data.header_logo_url);
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error("Error fetching header logo:", error);
        }
      }
    };

    fetchHeaderLogo();

    // 訂閱 realtime 更新
    const channel = supabase
      .channel('accommodation-logo-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'accommodation_info',
          filter: `id=eq.${currentAccommodationId}`
        },
        (payload) => {
          if (payload.new.header_logo_url) {
            setHeaderLogoUrl(payload.new.header_logo_url);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentAccommodationId]);

  const handleNavigate = (sectionId: string) => {
    onNavigate(sectionId);
    setOpen(false);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <button onClick={() => onNavigate("home")} className="flex items-center hover:opacity-80 transition-opacity">
          <img 
            src={headerLogoUrl || sensanLogo} 
            alt={accommodationName} 
            className="h-14 w-auto object-contain" 
          />
        </button>
        
        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-2 lg:gap-4 xl:gap-6">
          <button onClick={() => onNavigate("rooms")} className="text-xs lg:text-sm hover:text-primary transition-colors whitespace-nowrap px-1 lg:px-2">
            房型導覽
          </button>
          <button onClick={() => onNavigate("facilities")} className="text-xs lg:text-sm hover:text-primary transition-colors whitespace-nowrap px-1 lg:px-2">
            設施服務
          </button>
          <button onClick={() => onNavigate("gallery")} className="text-xs lg:text-sm hover:text-primary transition-colors whitespace-nowrap px-1 lg:px-2">
            精選照片
          </button>
          <button onClick={() => onNavigate("location")} className="text-xs lg:text-sm hover:text-primary transition-colors whitespace-nowrap px-1 lg:px-2">
            交通地圖
          </button>
          <button onClick={() => onNavigate("booking-info")} className="text-xs lg:text-sm hover:text-primary transition-colors whitespace-nowrap px-1 lg:px-2">
            訂房須知
          </button>
          <button onClick={() => onNavigate("faq")} className="text-xs lg:text-sm hover:text-primary transition-colors whitespace-nowrap px-1 lg:px-2">
            常見問題
          </button>
          <PreloadLink to="/order-search">
            <Button variant="outline" className="text-xs lg:text-sm h-8 lg:h-10 px-3 lg:px-4">
              <Search className="h-3 w-3 lg:h-4 lg:w-4 mr-1 lg:mr-2" />
              查詢訂單
            </Button>
          </PreloadLink>
          <PreloadLink to="/booking">
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
                <button 
                  onClick={() => handleNavigate("rooms")} 
                  className="text-lg font-medium text-foreground hover:text-primary transition-colors text-left py-4 border-b border-border/50"
                >
                  房型導覽
                </button>
                <button 
                  onClick={() => handleNavigate("facilities")} 
                  className="text-lg font-medium text-foreground hover:text-primary transition-colors text-left py-4 border-b border-border/50"
                >
                  設施服務
                </button>
                <button 
                  onClick={() => handleNavigate("gallery")} 
                  className="text-lg font-medium text-foreground hover:text-primary transition-colors text-left py-4 border-b border-border/50"
                >
                  精選照片
                </button>
                <button 
                  onClick={() => handleNavigate("location")} 
                  className="text-lg font-medium text-foreground hover:text-primary transition-colors text-left py-4 border-b border-border/50"
                >
                  交通地圖
                </button>
                <button 
                  onClick={() => handleNavigate("booking-info")} 
                  className="text-lg font-medium text-foreground hover:text-primary transition-colors text-left py-4 border-b border-border/50"
                >
                  訂房須知
                </button>
                <button 
                  onClick={() => handleNavigate("faq")} 
                  className="text-lg font-medium text-foreground hover:text-primary transition-colors text-left py-4 border-b border-border/50"
                >
                  常見問題
                </button>
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
