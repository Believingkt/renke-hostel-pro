import { useLocation, Outlet, Navigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { HQSidebar } from "@/components/HQSidebar";
import { Header } from "@/components/Header";
import { HQHeader } from "@/components/HQHeader";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { useOrderNotifications } from "@/hooks/use-order-notifications";
import { toast } from "sonner";
import { HQProvider } from "@/contexts/HQContext";

const isDev = import.meta.env.DEV;

export function ConditionalLayout() {
  const location = useLocation();
  const isFrontendPage = location.pathname === "/" || location.pathname.startsWith("/__cb/");
  const isAdminPage = location.pathname.startsWith("/admin");
  const isHQPage = location.pathname.startsWith("/hq") && location.pathname !== "/hq-auth";
  const isAuthPage = location.pathname === "/auth";
  const isHQAuthPage = location.pathname === "/hq-auth";
  
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsPasswordChange, setNeedsPasswordChange] = useState<boolean | null>(null);

  useOrderNotifications((isAdminPage || isHQPage) && !!session);

  useEffect(() => {
    if (isAdminPage) {
      document.title = "人客多 PMS 管理系統";
    } else if (isHQPage) {
      document.title = "人客多總部管理系統";
    } else if (isAuthPage) {
      document.title = "登入 - 人客多 PMS 管理系統";
    } else if (isHQAuthPage) {
      document.title = "登入 - 總部管理系統";
    }
  }, [isAdminPage, isHQPage, isAuthPage, isHQAuthPage]);

  const checkPasswordChangeRequired = useCallback((session: Session) => {
    const needsChange = session.user.user_metadata?.force_password_change === true;
    setNeedsPasswordChange(needsChange);
  }, []);

  const checkUserValidity = useCallback(async (userId: string) => {
    try {
      const { data: userRoles, error } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .limit(1);

      if (!error && (!userRoles || userRoles.length === 0)) {
        if (isDev) console.warn('User account deleted, signing out...');
        toast.error('您的帳號已被刪除，請聯繫系統管理員', { duration: 5000 });
        await supabase.auth.signOut();
      }
    } catch (error) {
      if (isDev) console.error('Error checking user validity:', error);
    }
  }, []);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);

      if (session) {
        checkPasswordChangeRequired(session);
        queueMicrotask(() => {
          void checkUserValidity(session.user.id);
        });
      } else {
        setNeedsPasswordChange(false);
      }

      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);

        if (!session) {
          setNeedsPasswordChange(false);
          return;
        }

        if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
          checkPasswordChangeRequired(session);
          queueMicrotask(() => {
            void checkUserValidity(session.user.id);
          });
          return;
        }

        if (event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
          checkPasswordChangeRequired(session);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [checkPasswordChangeRequired, checkUserValidity]);

  if (isFrontendPage) {
    return (
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Outlet />
      </TooltipProvider>
    );
  }

  // Show loading when checking session or password requirements
  if ((loading || needsPasswordChange === null) && (isAdminPage || isHQPage)) {
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

  if (isHQPage && !session && !loading) {
    return <Navigate to="/hq-auth" replace />;
  }

  if (isAuthPage && session && !loading) {
    if (needsPasswordChange) {
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
    return <Navigate to="/admin" replace />;
  }
  
  if (isAdminPage && session && needsPasswordChange && !loading) {
    return <Navigate to="/auth" replace />;
  }
  
  if (isHQPage && session && needsPasswordChange && !loading) {
    return <Navigate to="/hq-auth" replace />;
  }

  if (!isAdminPage && !isHQPage && !isAuthPage && !isHQAuthPage) {
    return <Outlet />;
  }

  if (isAuthPage || isHQAuthPage) {
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

  if (isHQPage) {
    return (
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <HQProvider>
          <SidebarProvider>
            <div className="admin-theme flex min-h-screen w-full">
              <HQSidebar />
              <div className="flex flex-1 flex-col overflow-hidden">
                <HQHeader />
                <main className="flex-1 p-4 md:p-6 overflow-y-auto overflow-x-hidden">
                  <Outlet />
                </main>
                <footer className="border-t py-3 px-4 md:py-4 md:px-6">
                  <p className="text-xs md:text-sm text-center text-muted-foreground">
                    © 2026 人客多總部管理系統. 版權所有
                  </p>
                </footer>
              </div>
            </div>
          </SidebarProvider>
        </HQProvider>
      </TooltipProvider>
    );
  }

  // Admin pages
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
                © 2026 人客多 PMS 管理系統. 版權所有
              </p>
            </footer>
          </div>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
