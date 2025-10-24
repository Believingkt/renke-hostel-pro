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

export function ConditionalLayout() {
  const location = useLocation();
  const isFrontendPage = location.pathname === "/";
  const isAdminPage = location.pathname.startsWith("/admin");
  const isLoginPage = location.pathname === "/login";
  
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 前台頁面：不使用任何 layout
  if (isFrontendPage) {
    return (
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Outlet />
      </TooltipProvider>
    );
  }

  // Show loading state while checking auth
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

  // Redirect to login if trying to access admin without authentication
  if (isAdminPage && !session && !loading) {
    return <Navigate to="/login" replace />;
  }

  // Redirect to admin if logged in user tries to access login page
  if (isLoginPage && session) {
    return <Navigate to="/admin" replace />;
  }

  // 非後台且非登入頁面也不使用 layout
  if (!isAdminPage && !isLoginPage) {
    return <Outlet />;
  }

  // 登入頁面：不使用 layout
  if (isLoginPage) {
    return (
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Outlet />
      </TooltipProvider>
    );
  }

  // PMS 後台頁面：使用完整 layout（已驗證登入）
  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <div className="flex flex-1 flex-col">
            <Header />
            <main className="flex-1 p-3 md:p-6 overflow-x-hidden">
              <Outlet />
            </main>
            <footer className="border-t py-4 px-3 md:px-6">
              <p className="text-sm text-center text-muted-foreground">
                © 2025 人客多 PMS 旅宿管理系統. 版權所有
              </p>
            </footer>
          </div>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
