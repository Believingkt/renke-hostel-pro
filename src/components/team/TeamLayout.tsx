import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TeamSidebar } from "./TeamSidebar";
import { TeamHeader } from "./TeamHeader";
import { TeamContext, type TeamContextValue } from "./TeamContext";
import { TEAM_ROLES, type TeamRole } from "./teamConfig";

export default function TeamLayout() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [ctx, setCtx] = useState<TeamContextValue | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: sessionRes } = await supabase.auth.getSession();
      const session = sessionRes.session;
      if (!session) {
        if (!cancelled) navigate("/team-auth", { replace: true });
        return;
      }

      const userId = session.user.id;

      const [{ data: rolesData }, { data: profileData }] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .is("accommodation_id", null),
        supabase
          .from("team_member_profiles")
          .select("display_name")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      const roles = (rolesData ?? [])
        .map((r) => r.role as TeamRole)
        .filter((r) => TEAM_ROLES.includes(r));

      if (roles.length === 0) {
        await supabase.auth.signOut();
        if (!cancelled) navigate("/team-auth", { replace: true });
        return;
      }

      if (!cancelled) {
        setCtx({
          userId,
          email: session.user.email ?? "",
          displayName:
            profileData?.display_name ||
            session.user.email?.split("@")[0] ||
            "未命名",
          roles,
        });
        setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/team-auth", { replace: true });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  if (loading || !ctx) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">載入中...</p>
        </div>
      </div>
    );
  }

  return (
    <TeamContext.Provider value={ctx}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <SidebarProvider>
          <div className="admin-theme flex min-h-screen w-full">
            <TeamSidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <TeamHeader />
              <main className="flex-1 p-4 md:p-6 overflow-y-auto overflow-x-hidden">
                <Outlet />
              </main>
              <footer className="border-t py-3 px-4 md:py-4 md:px-6">
                <p className="text-xs md:text-sm text-center text-muted-foreground">
                  © 2026 人客多行銷團隊後台
                </p>
              </footer>
            </div>
          </div>
        </SidebarProvider>
      </TooltipProvider>
    </TeamContext.Provider>
  );
}
