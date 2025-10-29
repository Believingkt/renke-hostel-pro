import { LogOut, UserCircle } from "lucide-react";
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
      // Use global scope to clear session from all tabs/windows
      await supabase.auth.signOut({ scope: 'global' });
      
      // Clear local storage manually as backup
      localStorage.removeItem('supabase.auth.token');
      sessionStorage.clear();
      
      toast.success("已登出");
      
      // Use replace to avoid keeping logout page in history
      window.location.replace(`${window.location.origin}/auth`);
    } catch (error) {
      // Even if signOut fails, force clear and redirect
      console.error("Logout error:", error);
      localStorage.removeItem('supabase.auth.token');
      sessionStorage.clear();
      toast.success("已登出");
      window.location.replace(`${window.location.origin}/auth`);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
      <div className="flex h-14 md:h-16 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-4">
          <SidebarTrigger />
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
          <AccommodationSelector />
          
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
