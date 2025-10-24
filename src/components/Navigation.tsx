import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Mountain, Menu } from "lucide-react";
import { useState } from "react";

interface NavigationProps {
  accommodationName?: string;
  onNavigate: (sectionId: string) => void;
}

const Navigation = ({ accommodationName = "森山寫造", onNavigate }: NavigationProps) => {
  const [open, setOpen] = useState(false);

  const handleNavigate = (sectionId: string) => {
    onNavigate(sectionId);
    setOpen(false);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mountain className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-primary">{accommodationName}</h1>
        </div>
        
        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <button onClick={() => onNavigate("home")} className="text-sm hover:text-primary transition-colors">
            旅宿介紹
          </button>
          <button onClick={() => onNavigate("rooms")} className="text-sm hover:text-primary transition-colors">
            房型導覽
          </button>
          <button onClick={() => onNavigate("booking-info")} className="text-sm hover:text-primary transition-colors">
            訂房須知
          </button>
          <button onClick={() => onNavigate("location")} className="text-sm hover:text-primary transition-colors">
            交通 & 地圖
          </button>
          <Button className="bg-primary hover:bg-primary/90">
            立即訂房
          </Button>
        </nav>

        {/* Mobile Navigation */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px]">
            <nav className="flex flex-col gap-6 mt-8">
              <button 
                onClick={() => handleNavigate("home")} 
                className="text-lg hover:text-primary transition-colors text-left py-2"
              >
                旅宿介紹
              </button>
              <button 
                onClick={() => handleNavigate("rooms")} 
                className="text-lg hover:text-primary transition-colors text-left py-2"
              >
                房型導覽
              </button>
              <button 
                onClick={() => handleNavigate("booking-info")} 
                className="text-lg hover:text-primary transition-colors text-left py-2"
              >
                訂房須知
              </button>
              <button 
                onClick={() => handleNavigate("location")} 
                className="text-lg hover:text-primary transition-colors text-left py-2"
              >
                交通 & 地圖
              </button>
              <Button className="bg-primary hover:bg-primary/90 w-full mt-4">
                立即訂房
              </Button>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};

export default Navigation;
