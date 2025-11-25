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
import { toast } from "sonner";

export function ConditionalLayout() {
  const location = useLocation();
  const isFrontendPage = location.pathname === "/";
  const isAdminPage = location.pathname.startsWith("/admin");
  const isAuthPage = location.pathname === "/auth";
  
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsPasswordChange, setNeedsPasswordChange] = useState<boolean | null>(null);

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
    console.log('[ConditionalLayout] Initial load, isAdminPage:', isAdminPage);
    
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log('[ConditionalLayout] Got session:', session?.user?.email);
      setSession(session);
      
      // Check if user needs to change password
      if (session) {
        console.log('[ConditionalLayout] Checking password change requirement...');
        await checkPasswordChangeRequired(session);
        setTimeout(() => {
          checkUserValidity(session.user.id);
        }, 0);
      } else {
        // No session, no need to check password
        console.log('[ConditionalLayout] No session, setting needsPasswordChange to false');
        setNeedsPasswordChange(false);
      }
      
      console.log('[ConditionalLayout] Setting loading to false');
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[ConditionalLayout] Auth state changed:', event, session?.user?.email);
        setSession(session);
        
        // Check password change requirement for relevant events
        if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session) {
          console.log('[ConditionalLayout] Checking password on auth event:', event);
          await checkPasswordChangeRequired(session);
          setTimeout(() => {
            checkUserValidity(session.user.id);
          }, 0);
        }
        
        // After user updates their info, recheck password requirement
        if (event === 'USER_UPDATED' && session) {
          console.log('[ConditionalLayout] User updated, rechecking password');
          await checkPasswordChangeRequired(session);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []); // Remove isAdminPage dependency to prevent infinite loop

  // Check if user needs to change password
  const checkPasswordChangeRequired = async (session: Session) => {
    console.log('[ConditionalLayout] checkPasswordChangeRequired started');
    try {
      const needsChange = session.user.user_metadata?.force_password_change === true;
      console.log('[ConditionalLayout] needsChange from metadata:', needsChange);
      
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('force_password_change')
        .eq('id', session.user.id)
        .single();
      
      console.log('[ConditionalLayout] Profile query result:', { profile, error });
      
      if (error) {
        console.error('[ConditionalLayout] Error fetching profile:', error);
        setNeedsPasswordChange(false);
        return;
      }
      
      const result = needsChange || profile?.force_password_change === true;
      console.log('[ConditionalLayout] Final password change required result:', result);
      setNeedsPasswordChange(result);
    } catch (error) {
      console.error('[ConditionalLayout] Error checking password change requirement:', error);
      setNeedsPasswordChange(false);
    }
  };

  // Check if user account still exists
  const checkUserValidity = async (userId: string) => {
    try {
      // Check if user has any roles (indicates account exists and is active)
      const { data: userRoles, error } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .limit(1);

      // If query succeeds but returns no data, user account has been deleted
      if (!error && (!userRoles || userRoles.length === 0)) {
        console.warn('User account deleted, signing out...');
        
        toast.error('您的帳號已被刪除，請聯繫系統管理員', {
          duration: 5000,
        });
        
        // Sign out and clear session
        await supabase.auth.signOut();
      }
    } catch (error) {
      console.error('Error checking user validity:', error);
    }
  };

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
  if ((loading || needsPasswordChange === null) && isAdminPage) {
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

  // If on auth page with session, check if password change is needed
  if (isAuthPage && session && !loading) {
    // If user needs to change password, stay on auth page
    if (needsPasswordChange) {
      // Let Auth.tsx handle the password change flow
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
    // Otherwise redirect to admin
    return <Navigate to="/admin" replace />;
  }
  
  // If on admin page but needs password change, redirect to auth
  if (isAdminPage && session && needsPasswordChange && !loading) {
    return <Navigate to="/auth" replace />;
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
