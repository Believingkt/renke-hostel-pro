import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { LogOut, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import lokezeLogo from "@/assets/lokeze-logo.png";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function HQHeader() {
  const navigate = useNavigate();
  const { isMobile, open } = useSidebar();

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
    <header className="sticky top-0 z-40 safe-top flex h-14 md:h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
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
          onClick={handleChangePassword}
          className="gap-2 h-9 md:h-10 text-sm"
        >
          <KeyRound className="h-4 w-4" />
          <span className="hidden sm:inline">修改密碼</span>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="gap-2 h-9 md:h-10 text-sm"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">登出</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確認登出</AlertDialogTitle>
              <AlertDialogDescription>
                您確定要登出總部管理系統嗎？
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={handleLogout}>確認登出</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </header>
  );
}
