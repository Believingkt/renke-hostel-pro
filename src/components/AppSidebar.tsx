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
  Database,
  Info,
  Wrench,
  Package,
  Image as ImageIcon,
  Navigation,
  HelpCircle,
  Hotel,
  Calendar,
  ShoppingBag,
  Ticket,
  UserCog,
  Shield,
  UserCheck,
  KeyRound,
  Megaphone,
  BadgePercent,
  Sparkles,
  BookOpen
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { PreloadLink } from "@/components/PreloadLink";
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
  { title: "訂單資訊", url: "/admin/orders?tab=list", icon: ShoppingBag },
  { 
    title: "官網內容", 
    url: "/admin/website-content", 
    icon: Globe,
    subItems: [
      { title: "網頁設定", url: "/admin/website-content?tab=basic-info", icon: Info },
      { title: "設施服務", url: "/admin/website-content?tab=facilities", icon: Wrench },
      { title: "加購方案", url: "/admin/website-content?tab=addon-plans", icon: Package },
      { title: "精選照片", url: "/admin/website-content?tab=gallery", icon: ImageIcon },
      { title: "交通地圖", url: "/admin/website-content?tab=location", icon: Navigation },
      { title: "訂房須知", url: "/admin/website-content?tab=booking-info", icon: BookOpen },
      { title: "常見問題", url: "/admin/website-content?tab=faq", icon: HelpCircle },
    ]
  },
  { 
    title: "物件管理", 
    url: "/admin/pricing", 
    icon: Hotel,
    subItems: [
      { title: "房型管理", url: "/admin/pricing?tab=rooms", icon: Hotel },
      { title: "價格管理", url: "/admin/pricing?tab=basic", icon: DollarSign },
      { title: "客房設施", url: "/admin/pricing?tab=facilities", icon: Wrench },
      { title: "庫存管理", url: "/admin/pricing?tab=inventory", icon: Package },
      { title: "國定假日", url: "/admin/pricing?tab=holidays", icon: Calendar },
    ]
  },
  { title: "顧客資料", url: "/admin/customers", icon: Users },
  { title: "網紅導購", url: "/admin/discount-codes", icon: Sparkles },
  { title: "帳號管理", url: "/admin/accounts", icon: KeyRound },
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
    <Sidebar collapsible="icon" className="border-r transition-all duration-300">
      <SidebarHeader className="border-b px-6 py-4 transition-all duration-300">
        <PreloadLink 
          to="/admin" 
          onClick={handleLinkClick}
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity duration-200"
        >
          {open && (
            <div className="animate-in fade-in-0 slide-in-from-left-5 duration-300">
              <img src={lokezeLogo} alt="Lokeze" className="h-8 object-contain" />
            </div>
          )}
        </PreloadLink>
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
                        <SidebarMenuButton className="h-12 py-3 text-base transition-all duration-200">
                          <item.icon className="h-5 w-5 transition-transform duration-200" />
                          <span className="transition-all duration-200">{item.title}</span>
                          <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-300 ease-out group-data-[state=open]/collapsible:rotate-180" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="transition-all duration-300 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                        <SidebarMenuSub className="ml-2 border-l-2 border-sidebar-border px-0 space-y-1 mt-1">
                        {item.subItems.map((subItem: any) => (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton asChild className="h-10 px-4 pl-8 hover:bg-sidebar-accent/50 transition-all duration-200">
                              <PreloadLink 
                                to={subItem.url}
                                onClick={handleLinkClick}
                                className={isActiveSubItem(subItem.url) ? "bg-sidebar-accent" : ""}
                              >
                                {subItem.icon && <subItem.icon className="h-4 w-4" />}
                                <span className="transition-colors duration-200">{subItem.title}</span>
                              </PreloadLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </Collapsible>
                  ) : (
                    <SidebarMenuButton asChild isActive={isActiveRoute(item.url)} className="h-12 py-3 text-base transition-all duration-200">
                      <PreloadLink 
                        to={item.url}
                        onClick={handleLinkClick}
                      >
                        <item.icon className="h-5 w-5 transition-transform duration-200" />
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
