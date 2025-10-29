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
  ChevronDown,
  Globe
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
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
  { title: "營運報表", url: "/admin", icon: BarChart3 },
  { 
    title: "櫃檯接待", 
    url: "/admin/reception", 
    icon: Users,
    subItems: [
      { title: "今日櫃檯", url: "/admin/reception?tab=today" },
      { title: "房況表", url: "/admin/reception?tab=status" },
    ]
  },
      {
        title: "官網內容",
        url: "/admin/website-content",
        icon: Globe,
        subItems: [
          { title: "設施與服務", url: "/admin/website-content?tab=facilities" },
          { title: "訂房須知", url: "/admin/website-content?tab=booking-info" },
          { title: "常見問題", url: "/admin/website-content?tab=faq" },
          { title: "交通 & 地圖", url: "/admin/website-content?tab=location" },
        ]
      },
  { title: "帳務資訊", url: "/admin/basic-info", icon: Building2 },
  { 
    title: "房型價格庫存", 
    url: "/admin/pricing", 
    icon: DollarSign,
    subItems: [
      { title: "房型管理", url: "/admin/pricing?tab=rooms" },
      { title: "價格管理", url: "/admin/pricing?tab=basic" },
      { title: "庫存管理", url: "/admin/pricing?tab=inventory" },
    ]
  },
  { title: "空房查詢", url: "/admin/availability", icon: Search },
  { 
    title: "訂單查詢", 
    url: "/admin/orders", 
    icon: ClipboardList,
    subItems: [
      { title: "訂單資訊", url: "/admin/orders?tab=info" },
      { title: "訂單列表", url: "/admin/orders?tab=list" },
      { title: "保留單列表", url: "/admin/orders?tab=reserved" },
    ]
  },
  { title: "帳號管理", url: "/admin/accounts", icon: Settings },
  { title: "KOL折扣代碼", url: "/admin/discount-codes", icon: Tag },
  { title: "用戶權限管理", url: "/admin/user-roles", icon: Users },
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
        <NavLink 
          to="/admin" 
          onClick={handleLinkClick}
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
        >
          {open && (
            <div>
              <h2 className="text-2xl font-semibold text-primary">
                森山寫造 <span className="text-xs text-black dark:text-white">PMS 管理系統</span>
              </h2>
            </div>
          )}
        </NavLink>
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
                          <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
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
