import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import sensanLogo from "@/assets/sensan-logo-new.png";

interface NavigationProps {
  accommodationName?: string;
  onNavigate: (sectionId: string) => void;
}

const Navigation = ({ accommodationName = "森山寫照", onNavigate }: NavigationProps) => {
  const [open, setOpen] = useState(false);

  const handleNavigate = (sectionId: string) => {
    onNavigate(sectionId);
    setOpen(false);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <button onClick={() => onNavigate("home")} className="flex items-center hover:opacity-80 transition-opacity">
          <img src={sensanLogo} alt={accommodationName} className="h-14 w-auto" />
        </button>
        
        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <button onClick={() => onNavigate("rooms")} className="text-sm hover:text-primary transition-colors">
            房型導覽
          </button>
          <button onClick={() => onNavigate("facilities")} className="text-sm hover:text-primary transition-colors">
            設施與服務
          </button>
          <button onClick={() => onNavigate("location")} className="text-sm hover:text-primary transition-colors">
            交通 & 地圖
          </button>
          <button onClick={() => onNavigate("booking-info")} className="text-sm hover:text-primary transition-colors">
            訂房須知
          </button>
          <button onClick={() => onNavigate("faq")} className="text-sm hover:text-primary transition-colors">
            常見問題
          </button>
          <Link to="/booking">
            <Button className="bg-primary hover:bg-primary/90">
              立即預訂
            </Button>
          </Link>
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
                  設施與服務
                </button>
                <button 
                  onClick={() => handleNavigate("location")} 
                  className="text-lg font-medium text-foreground hover:text-primary transition-colors text-left py-4 border-b border-border/50"
                >
                  交通 & 地圖
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
              
              {/* 底部訂房按鈕 */}
              <div className="p-6">
                <Link to="/booking" className="block">
                  <Button 
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-base font-medium rounded-lg shadow-lg"
                    onClick={() => setOpen(false)}
                  >
                    立即預訂
                  </Button>
                </Link>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};

export default Navigation;
