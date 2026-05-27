import { NavLink, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import lokezeLogo from "@/assets/lokeze-logo.png";
import { TEAM_MENU } from "./teamConfig";
import { useTeam } from "./TeamContext";

export function TeamSidebar() {
  const { state, setOpenMobile, isMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { roles, displayName } = useTeam();

  const isAdmin = roles.includes("super_admin") || roles.includes("admin");
  const isVenueManagerOnly =
    !isAdmin &&
    roles.includes("venue_manager") &&
    roles.every((r) => r === "venue_manager");
  const visibleItems = TEAM_MENU.filter((item) => {
    if (isVenueManagerOnly) return item.url === "/team/kol/venue-confirm";
    if (!item.allowedRoles) return true;
    if (isAdmin) return true;
    return item.allowedRoles.some((r) => roles.includes(r));
  });

  const isActive = (url: string) =>
    url === "/team" ? pathname === "/team" : pathname.startsWith(url);

  const handleClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("已登出");
    navigate("/team-auth");
  };

  return (
    <Sidebar collapsible="icon" className="admin-theme border-r">
      {!collapsed && (
        <SidebarHeader className="border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <img src={lokezeLogo} alt="Lokeze" className="h-8 object-contain" />
            <span className="text-sm font-medium text-muted-foreground">
              行銷團隊
            </span>
          </div>
        </SidebarHeader>
      )}

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2.5">
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    className="h-12 py-3 text-base"
                  >
                    <NavLink to={item.url} onClick={handleClick}>
                      <item.icon className="h-5 w-5" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {!collapsed && (
        <SidebarFooter className="border-t p-3 gap-2">
          <div className="px-2 py-1">
            <p className="text-xs text-muted-foreground">目前登入</p>
            <p className="text-sm font-medium truncate">{displayName}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="w-full gap-2"
          >
            <LogOut className="h-4 w-4" />
            登出
          </Button>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
