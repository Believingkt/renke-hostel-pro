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
  Banknote,
  Sparkles,
  BookOpen,
  Bed,
  TrendingUp,
  Star,
  ConciergeBell,
  Plug,
  FileText,
  Mail,
  LayoutPanelTop
} from "lucide-react";
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

const menuItems = [
  { title: "營運分析", url: "/admin", icon: BarChart3, moduleKey: "analytics" },
  { title: "櫃檯接待", url: "/admin/reception", icon: ConciergeBell, moduleKey: "reception" },
  { 
    title: "訂單資訊", 
    url: "/admin/orders", 
    icon: ShoppingBag,
    moduleKey: "orders",
    subItems: [
      { title: "預訂管理", url: "/admin/room-inventory", icon: Package },
      { title: "訂單列表", url: "/admin/orders?tab=list", icon: ClipboardList },
    ]
  },
  { 
    title: "官網內容", 
    url: "/admin/website-content", 
    icon: Globe,
    moduleKey: "website_content",
    subItems: [
      { title: "網頁設定", url: "/admin/website-content?tab=basic-info", icon: Info },
      { title: "訂房頁標頭", url: "/admin/website-content?tab=villa-header", icon: LayoutPanelTop },
      { title: "設施服務", url: "/admin/website-content?tab=facilities", icon: Wrench },
      { title: "交通地圖", url: "/admin/website-content?tab=location", icon: Navigation },
      { title: "Google 評論", url: "/admin/website-content?tab=reviews", icon: Star },
      { title: "常見問題", url: "/admin/website-content?tab=faq", icon: HelpCircle },
      { title: "訂房須知", url: "/admin/website-content?tab=booking-info", icon: BookOpen },
      { title: "加購方案", url: "/admin/website-content?tab=addon-plans", icon: Package },
      { title: "精選照片", url: "/admin/website-content?tab=gallery", icon: ImageIcon },
      { title: "精選民宿卡片", url: "/admin/website-content?tab=portal-card", icon: Sparkles },
      { title: "訂房確認通知", url: "/admin/website-content?tab=email-notification", icon: Mail },

    ]
  },
  { 
    title: "房型設施", 
    url: "/admin/pricing", 
    icon: Hotel,
    moduleKey: "pricing",
    subItems: [
      { title: "房型管理", url: "/admin/pricing?tab=rooms", icon: Bed },
      { title: "客房設施", url: "/admin/pricing?tab=facilities", icon: Wrench },
    ]
  },
  { 
    title: "房價庫存", 
    url: "/admin/room-price-calendar", 
    icon: DollarSign,
    moduleKey: "room_price",
    subItems: [
      { title: "房價庫存設定", url: "/admin/room-price-calendar", icon: DollarSign },
      { title: "房價價格設定", url: "/admin/projects", icon: TrendingUp },
      { title: "訂房入住方案", url: "/admin/packages", icon: Package },
      { title: "搜尋圖卡設定", url: "/admin/search-card", icon: Package },
      { title: "國定假日", url: "/admin/holidays", icon: Calendar },
    ]
  },
  { title: "顧客資料", url: "/admin/customers", icon: Users, moduleKey: "customers" },
  { title: "網紅導購", url: "/admin/discount-codes", icon: Sparkles, moduleKey: "discount_codes" },
  // { title: "請款管理", url: "/admin/settlement", icon: Banknote, moduleKey: "settlement" },
  { title: "業主月結", url: "/admin/owner-settlement", icon: FileText, moduleKey: "owner_settlement" },
  { title: "購物商品", url: "/admin/addon-center", icon: Package, moduleKey: "addon_center" },
  { title: "通路管理", url: "/admin/channel-manager", icon: Plug, moduleKey: "channel_manager" },
  { title: "AI 管家", url: "/admin/ai-training", icon: Sparkles, moduleKey: "ai_training" },
  // { title: "流量分析", url: "/admin/analytics", icon: TrendingUp },
  { title: "帳號管理", url: "/admin/accounts", icon: KeyRound, moduleKey: "accounts" },
];

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
