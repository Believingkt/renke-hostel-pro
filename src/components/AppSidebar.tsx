import { 
  Building2,
  DoorOpen, 
  DollarSign, 
  Search, 
  ClipboardList, 
  Users, 
  BarChart3, 
  Settings,
  Tag,
  ChevronRight
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import logo from "@/assets/logo.jpg";
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

const menuItems = [
  { title: "營運報表", url: "/", icon: BarChart3 },
  { 
    title: "櫃檯接待", 
    url: "/reception", 
    icon: Users,
    subItems: [
      { title: "今日櫃檯", url: "/reception?tab=today" },
      { title: "房況表", url: "/reception?tab=status" },
    ]
  },
  { title: "基本資訊", url: "/basic-info", icon: Building2 },
  { 
    title: "房價庫存設定", 
    url: "/pricing", 
    icon: DollarSign,
    subItems: [
      { title: "基本價格", url: "/pricing?tab=basic" },
      { title: "專案價格", url: "/pricing?tab=project" },
      { title: "庫存管理", url: "/pricing?tab=inventory" },
    ]
  },
  { title: "空房查詢", url: "/availability", icon: Search },
  { 
    title: "訂單查詢", 
    url: "/orders", 
    icon: ClipboardList,
    subItems: [
      { title: "訂單資訊", url: "/orders?tab=info" },
      { title: "訂單列表", url: "/orders?tab=list" },
      { title: "保留單列表", url: "/orders?tab=reserved" },
    ]
  },
  { title: "帳號權限管理", url: "/accounts", icon: Settings },
  { title: "KOL折扣代碼", url: "/discount-codes", icon: Tag },
];

export function AppSidebar() {
  const { open, setOpenMobile, isMobile } = useSidebar();
  const location = useLocation();

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const isActiveRoute = (url: string) => {
    const pathname = location.pathname;
    const urlPath = url.split('?')[0];
    return pathname === urlPath;
  };

  const isActiveSubItem = (url: string) => {
    return location.pathname + location.search === url;
  };

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <img 
            src={logo} 
            alt="人客多 Logo" 
            className="h-12 w-12 rounded-lg object-cover"
          />
          {open && (
            <div>
              <h2 className="text-2xl font-semibold text-primary">人客多 PMS</h2>
              <p className="text-sm text-muted-foreground">旅宿管理系統</p>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2.5">
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {item.subItems ? (
                    <Collapsible defaultOpen={isActiveRoute(item.url)} className="group/collapsible">
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton className="h-12 py-3 text-base">
                          <item.icon className="h-5 w-5" />
                          <span>{item.title}</span>
                          <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {item.subItems.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton asChild>
                                <NavLink 
                                  to={subItem.url}
                                  onClick={handleLinkClick}
                                  className={isActiveSubItem(subItem.url) ? "bg-sidebar-accent" : ""}
                                >
                                  <span>{subItem.title}</span>
                                </NavLink>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </Collapsible>
                  ) : (
                    <SidebarMenuButton asChild className="h-12 py-3 text-base">
                      <NavLink 
                        to={item.url}
                        onClick={handleLinkClick}
                        className={({ isActive }) =>
                          isActive ? "bg-sidebar-accent" : ""
                        }
                      >
                        <item.icon className="h-5 w-5" />
                        <span>{item.title}</span>
                      </NavLink>
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
