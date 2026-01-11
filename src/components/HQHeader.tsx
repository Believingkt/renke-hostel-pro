import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { LogOut, KeyRound, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import lokezeLogo from "@/assets/lokeze-logo.png";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHQ } from "@/contexts/HQContext";

export function HQHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile, open } = useSidebar();
  const { selectedAccommodation, setSelectedAccommodation, accommodations, accommodationsLoading } = useHQ();

  // Only show accommodation selector on overview page
  const showAccommodationSelector = location.pathname === "/hq" || location.search.includes("tab=overview");

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("已登出");
      navigate("/hq-auth");
    } catch (error) {
      toast.error("登出失敗");
    }
  };

  const handleChangePassword = () => {
    navigate("/headquarters/change-password");
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 md:h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="h-9 w-9 md:h-10 md:w-10" />
        {(!open || isMobile) && (
          <div className="flex items-center gap-2">
            <img src={lokezeLogo} alt="Lokeze" className="h-6 md:h-7 object-contain" />
            <span className="text-xs md:text-sm font-medium text-muted-foreground hidden sm:inline">總部管理</span>
          </div>
        )}
      </div>
      
      <div className="flex-1" />
      
      <div className="flex items-center gap-2 md:gap-3">
        {showAccommodationSelector && !accommodationsLoading && accommodations.length > 0 && (
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground hidden sm:block" />
            <Select value={selectedAccommodation} onValueChange={setSelectedAccommodation}>
              <SelectTrigger className="w-[140px] sm:w-[180px] h-9 bg-background">
                <SelectValue placeholder="選擇民宿" />
              </SelectTrigger>
              <SelectContent className="bg-background border shadow-lg z-50">
                <SelectItem value="all">全部民宿</SelectItem>
                {accommodations.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleChangePassword}
          className="gap-2 h-9 md:h-10 text-sm"
        >
          <KeyRound className="h-4 w-4" />
          <span className="hidden sm:inline">修改密碼</span>
        </Button>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleLogout}
          className="gap-2 h-9 md:h-10 text-sm"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">登出</span>
        </Button>
      </div>
    </header>
  );
}
