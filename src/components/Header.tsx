import { LogOut, UserCircle, Bell } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useSubdomain } from "@/hooks/use-subdomain";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AccommodationSelector } from "@/components/AccommodationSelector";
import { Badge } from "@/components/ui/badge";

export function Header() {
  const navigate = useNavigate();
  const { accommodationId } = useSubdomain();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!accommodationId) return;

    const fetchUnreadCount = async () => {
      try {
        const { count, error } = await (supabase as any)
          .from("notifications")
          .select("*", { count: 'exact', head: true })
          .eq("accommodation_id", accommodationId)
          .eq("is_read", false);

        if (!error && count !== null) {
          setUnreadCount(count);
        }
      } catch (error) {
        console.error("Error fetching unread count:", error);
      }
    };

    fetchUnreadCount();

    // 訂閱新通知
    const channel = supabase
      .channel('unread-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `accommodation_id=eq.${accommodationId}`
        },
        () => {
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accommodationId]);

  const handleLogout = async () => {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-') || key.includes('supabase')) {
          localStorage.removeItem(key);
        }
      });
      
      sessionStorage.clear();
      await supabase.auth.signOut({ scope: 'global' });
      toast.success("已登出");
      await new Promise(resolve => setTimeout(resolve, 100));
      window.location.replace(`${window.location.origin}/auth`);
    } catch (error) {
      localStorage.clear();
      sessionStorage.clear();
      toast.success("已登出");
      window.location.replace(`${window.location.origin}/auth`);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
      <div className="flex h-16 md:h-16 items-center justify-between px-4 md:px-6 gap-2">
        <div className="flex items-center gap-2 md:gap-4">
          <SidebarTrigger className="h-10 w-10" />
        </div>
        
        <div className="flex items-center gap-1 md:gap-3">
          <div className="hidden sm:block">
            <AccommodationSelector />
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 relative touch-manipulation"
            onClick={() => navigate('/admin/notifications')}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px]"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </Badge>
            )}
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-11 w-11 touch-manipulation">
                <UserCircle className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer py-3">
                <LogOut className="mr-2 h-4 w-4" />
                <span className="text-base">登出</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
