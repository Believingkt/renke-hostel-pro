import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Menu, LogOut, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import lokezeLogo from "@/assets/lokeze-logo.png";

export function HQHeader() {
  const navigate = useNavigate();
  const { isMobile, open } = useSidebar();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("已登出");
      navigate("/auth");
    } catch (error) {
      toast.error("登出失敗");
    }
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
      
      <div className="flex items-center gap-2">
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
