import { ChevronDown } from "lucide-react";
import { useLocation } from "react-router-dom";
import { PreloadLink } from "@/components/PreloadLink";
import { useAliasPrefix } from "@/hooks/use-alias-prefix";
import { useStaffPermissions } from "@/hooks/use-staff-permissions";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import lokezeLogo from "@/assets/lokeze-logo.png";
import owlnestLogo from "@/assets/owlnest-logo.png";
import { ADMIN_MENU_ITEMS } from "@/config/adminMenu";

const menuItems = ADMIN_MENU_ITEMS;


export function AppSidebar() {
  const { open, setOpenMobile, isMobile } = useSidebar();
  const location = useLocation();
  const { withPrefix, prefix } = useAliasPrefix();
  const { canView, isStaff } = useStaffPermissions();

  const visibleMenuItems = menuItems.filter(
    (item) => !isStaff || !item.moduleKey || canView(item.moduleKey)
  );

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const isActiveRoute = (url: string) => {
    const pathname = location.pathname;
    const urlPath = withPrefix(url.split('?')[0]);
    return pathname === urlPath;
  };

  const isActiveSubItem = (url: string) => {
    const [path, search] = url.split('?');
    const fullUrl = withPrefix(path) + (search ? `?${search}` : '');
    return location.pathname + location.search === fullUrl;
  };

  return (
    <Sidebar collapsible="icon" className="admin-theme border-r transition-all duration-300">
      <SidebarHeader className="border-b px-6 py-4 transition-all duration-300">
        <PreloadLink 
          to={withPrefix("/admin")} 
          onClick={handleLinkClick}
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity duration-200"
        >
          {open && (
            <div className="flex items-center gap-3 animate-in fade-in-0 slide-in-from-left-5 duration-300">
              <img src={lokezeLogo} alt="Lokeze" className="h-8 object-contain" />
              <div className="h-6 w-px bg-border" />
              <img
                src={owlnestLogo}
                alt="OwlNest"
                className="h-8 object-contain opacity-80 hover:opacity-100 transition-opacity"
                title="技術合作 OwlNest"
              />
            </div>
          )}
        </PreloadLink>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2.5">
              {visibleMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {item.subItems ? (
                    <Collapsible defaultOpen={isActiveRoute(item.url)} className="group/collapsible">
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton className="h-12 py-3 text-base transition-all duration-200 hover:scale-[1.02]">
                          <item.icon className="h-5 w-5 transition-all duration-200 group-hover:scale-110" />
                          <span className="transition-all duration-200">{item.title}</span>
                          <ChevronDown className="ml-auto h-4 w-4 transition-all duration-300 ease-in-out group-data-[state=open]/collapsible:rotate-180 group-hover:scale-110" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="overflow-hidden transition-all duration-300 ease-in-out data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                        <SidebarMenuSub className="ml-2 border-l-2 border-sidebar-border px-0 space-y-1 mt-1">
                        {item.subItems.map((subItem: any, index: number) => (
                          <SidebarMenuSubItem 
                            key={subItem.title}
                            className="animate-in fade-in-0 slide-in-from-left-2"
                            style={{ animationDelay: `${index * 30}ms`, animationDuration: '200ms' }}
                          >
                            <SidebarMenuSubButton asChild className="h-10 px-4 pl-8 hover:bg-sidebar-accent/50 hover:translate-x-1 transition-all duration-200">
                              <PreloadLink 
                                to={(() => {
                                  const [p, s] = subItem.url.split('?');
                                  return withPrefix(p) + (s ? `?${s}` : '');
                                })()}
                                onClick={handleLinkClick}
                                className={isActiveSubItem(subItem.url) ? "bg-sidebar-accent" : ""}
                              >
                                {subItem.icon && <subItem.icon className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />}
                                <span className="transition-colors duration-200">{subItem.title}</span>
                              </PreloadLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </Collapsible>
                  ) : (
                    <SidebarMenuButton asChild isActive={isActiveRoute(item.url)} className="h-12 py-3 text-base transition-all duration-200 hover:scale-[1.02]">
                      <PreloadLink 
                        to={withPrefix(item.url)}
                        onClick={handleLinkClick}
                      >
                        <item.icon className="h-5 w-5 transition-all duration-200 group-hover:scale-110" />
                        <span className="transition-all duration-200">{item.title}</span>
                      </PreloadLink>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
