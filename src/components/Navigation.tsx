import { Button } from "@/components/ui/button";
import { Mountain } from "lucide-react";

interface NavigationProps {
  accommodationName?: string;
  onNavigate: (sectionId: string) => void;
}

const Navigation = ({ accommodationName = "森山寫造", onNavigate }: NavigationProps) => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mountain className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-primary">{accommodationName}</h1>
        </div>
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
      </div>
    </header>
  );
};

export default Navigation;
