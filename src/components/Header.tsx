import { LogOut, UserCircle, Bell, Key, ExternalLink } from "lucide-react";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAliasPrefix } from "@/hooks/use-alias-prefix";
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
import AccommodationLogo from "@/components/AccommodationLogo";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { useAccommodationLogo } from "@/hooks/use-accommodation-logo";
import lokezeLogo from "@/assets/lokeze-logo.png";
import owlnestLogo from "@/assets/owlnest-logo.png";

export function Header() {
  const navigate = useNavigate();
  const { aliasNavigate } = useAliasPrefix();
  const { accommodationId } = useSubdomain();
  const { userAccommodations } = useAccommodation();
  const { open, isMobile } = useSidebar();
  const [unreadCount, setUnreadCount] = useState(0);
  const [userName, setUserName] = useState<string | null>(null);
  
  // 使用統一的 hook 取得 logo 和住宿名稱
  const { accommodationName } = useAccommodationLogo({ variant: "header", fetchName: true });

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("name")
            .eq("id", user.id)
            .single();
          
          if (profile) {
            setUserName(profile.name);
          }
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
      }
    };

    fetchUserProfile();
  }, []);

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
      .channel(`unread-notifications-${accommodationId}`)
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

  // 只有一個住宿時不需要選擇器
  const hasMultipleAccommodations = userAccommodations.length > 1;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
      <div className="flex h-16 md:h-16 items-center justify-between px-4 md:px-6 gap-2">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="h-10 w-10" />
          {/* Sidebar 收起時顯示 Lakeze 主體 + OwlNest 技術合作 */}
          {(!open || isMobile) && (
            <div className="flex items-center gap-2 group">
              <img
                src={lokezeLogo}
                alt="Lakeze 人客多"
                className="h-8 md:h-9 object-contain"
              />
              <div className="h-5 md:h-6 w-px bg-border/60" />
              <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-md transition-all duration-200 hover:bg-muted cursor-default">
                <span className="hidden sm:inline text-[9px] md:text-[10px] uppercase tracking-wider text-muted-foreground/60 group-hover:text-foreground font-medium transition-colors">
                  技術合作
                </span>
                <img
                  src={owlnestLogo}
                  alt="OwlNest 奧丁丁"
                  className="h-5 md:h-6 object-contain opacity-50 group-hover:opacity-100 transition-opacity duration-200"
                />
              </div>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3 md:gap-4">
          <div className="hidden sm:block">
            <AccommodationSelector />
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 relative touch-manipulation"
            onClick={() => aliasNavigate('/admin/notifications')}
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
              <Button variant="ghost" className="h-10 px-3 md:px-4 gap-2 touch-manipulation">
                <UserCircle className="h-5 w-5 flex-shrink-0" />
                {userName && (
                  <span className="hidden md:inline-block text-sm font-medium max-w-[120px] truncate">
                    {userName}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => navigate('/')} className="cursor-pointer py-3">
                <ExternalLink className="mr-2 h-4 w-4" />
                <span className="text-base">回到前台</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/admin/change-password')} className="cursor-pointer py-3">
                <Key className="mr-2 h-4 w-4" />
                <span className="text-base">修改密碼</span>
              </DropdownMenuItem>
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
