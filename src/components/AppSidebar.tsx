import { 
  DoorOpen, 
  DollarSign, 
  ClipboardList, 
  Users, 
  BarChart3, 
  Settings,
  Tag,
  ChevronDown,
  Globe,
  Building,
  UserCircle,
  Database
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
import lokezeLogo from "@/assets/lokeze-logo.png";

const menuItems = [
  { title: "營運分析", url: "/admin", icon: BarChart3 },
  { title: "訂單資訊", url: "/admin/orders?tab=list", icon: ClipboardList },
  { 
    title: "官網內容", 
    url: "/admin/website-content", 
    icon: Globe,
    subItems: [
      { title: "基本資料", url: "/admin/website-content?tab=basic-info" },
      { title: "設施與服務", url: "/admin/website-content?tab=facilities" },
      { title: "加購方案", url: "/admin/website-content?tab=add-on-plans" },
      { title: "精選照片", url: "/admin/website-content?tab=gallery" },
      { title: "交通 & 地圖", url: "/admin/website-content?tab=location" },
      { title: "訂房須知", url: "/admin/website-content?tab=booking-info" },
      { title: "常見問題", url: "/admin/website-content?tab=faq" },
    ]
  },
  { 
    title: "物件管理", 
    url: "/admin/pricing", 
    icon: DollarSign,
    subItems: [
      { title: "房型管理", url: "/admin/pricing?tab=rooms" },
      { title: "價格管理", url: "/admin/pricing?tab=basic" },
      { title: "客房設施", url: "/admin/pricing?tab=facilities" },
      { title: "庫存管理", url: "/admin/pricing?tab=inventory" },
      { title: "國定假日", url: "/admin/pricing?tab=holidays" },
    ]
  },
  { title: "顧客資料", url: "/admin/customers", icon: UserCircle },
  { title: "折扣代碼", url: "/admin/discount-codes", icon: Tag },
  { title: "資料備份", url: "/admin/backup", icon: Database },
  { title: "帳號管理", url: "/admin/accounts", icon: Settings },
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
              <img src={lokezeLogo} alt="Lokeze" className="h-8 object-contain" />
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
                        <SidebarMenuSub className="ml-4 border-l-2 border-sidebar-border px-0 space-y-1 mt-1">
                          {item.subItems.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton asChild className="h-10 px-4 pl-12 hover:bg-sidebar-accent/50 transition-colors">
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
