import { useLocation, Outlet, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { useOrderNotifications } from "@/hooks/use-order-notifications";

export function ConditionalLayout() {
  const location = useLocation();
  const isFrontendPage = location.pathname === "/";
  const isAdminPage = location.pathname.startsWith("/admin");
  const isAuthPage = location.pathname === "/auth";
  
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // 啟用訂單即時通知（僅在後台頁面且已登入時）
  useOrderNotifications(isAdminPage && !!session);

  useEffect(() => {
    if (isAdminPage) {
      document.title = "人客多 PMS 管理系統";
    } else if (isAuthPage) {
      document.title = "登入 - 人客多 PMS 管理系統";
    } else {
      document.title = "森山寫照 - 山間的寧靜時光";
    }
  }, [isAdminPage, isAuthPage, isFrontendPage]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  if (isFrontendPage) {
    return (
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Outlet />
      </TooltipProvider>
    );
  }

  if (loading && isAdminPage) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">載入中...</p>
        </div>
      </div>
    );
  }

  if (isAdminPage && !session && !loading) {
    return <Navigate to="/auth" replace />;
  }

  if (isAuthPage && session) {
    return <Navigate to="/admin" replace />;
  }

  if (!isAdminPage && !isAuthPage) {
    return <Outlet />;
  }

  if (isAuthPage) {
    return (
      <TooltipProvider>
        <div className="admin-theme">
          <Toaster />
          <Sonner />
          <Outlet />
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SidebarProvider>
        <div className="admin-theme flex min-h-screen w-full">
          <AppSidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header />
            <main className="flex-1 p-4 md:p-6 overflow-y-auto overflow-x-hidden">
              <Outlet />
            </main>
            <footer className="border-t py-3 px-4 md:py-4 md:px-6">
              <p className="text-xs md:text-sm text-center text-muted-foreground">
                © 2025 人客多 PMS 管理系統. 版權所有
              </p>
            </footer>
          </div>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
