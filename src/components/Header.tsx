import { Bell, LogOut, UserCircle } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AccommodationSelector } from "@/components/AccommodationSelector";

export function Header() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      toast.success("已登出");
      // Force page reload to clear all state
      window.location.href = "/auth";
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("登出失敗");
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
      <div className="flex h-14 md:h-16 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-4">
          <SidebarTrigger />
          <AccommodationSelector />
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
          <Button variant="ghost" size="icon" className="relative h-9 w-9 md:h-10 md:w-10">
            <Bell className="h-4 w-4 md:h-5 md:w-5" />
            <span className="absolute right-1.5 top-1.5 md:right-2 md:top-2 h-2 w-2 rounded-full bg-primary"></span>
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 md:h-10 md:w-10">
                <UserCircle className="h-5 w-5 md:h-6 md:w-6" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                登出
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
