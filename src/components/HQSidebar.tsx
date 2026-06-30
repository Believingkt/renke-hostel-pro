import { 
  Building2, 
  BarChart3, 
  DollarSign, 
  Users, 
  Settings,
  ChevronDown,
  FileText,
  ClipboardList,
  Utensils,
  Handshake,
  UserCheck,
  Ticket,
  Gift,
  Activity,
  Bot,
  Inbox,
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
  { title: "營運分析", url: "/hq", icon: BarChart3, tab: "overview" },
  { 
    title: "金流拆帳", 
    url: "/hq?tab=split", 
    icon: DollarSign, 
    tab: "split",
    subItems: [
      { title: "手續費設定", url: "/hq?tab=split&section=rules", icon: FileText },
      { title: "請款明細", url: "/hq?tab=split&section=details", icon: ClipboardList },
    ]
  },
  { title: "民宿管理", url: "/hq?tab=accommodations", icon: Building2, tab: "accommodations" },
  { title: "設施管理", url: "/hq?tab=facilities", icon: Utensils, tab: "facilities" },
  { title: "帳號管理", url: "/hq?tab=users", icon: Users, tab: "users" },
  { title: "合作夥伴", url: "/hq?tab=partners", icon: Handshake, tab: "partners" },
  { title: "會員管理", url: "/hq?tab=members", icon: UserCheck, tab: "members" },
  { title: "優惠券管理", url: "/hq?tab=coupons", icon: Ticket, tab: "coupons" },
  { title: "點數規則", url: "/hq?tab=point-rules", icon: Gift, tab: "point-rules" },
  { title: "AI 訓練中心", url: "/hq/ai-training", icon: Bot, tab: "ai-training" },
  {
    title: "系統管理",
    url: "/hq?tab=system&section=settings",
    icon: Settings,
    tab: "system",
    subItems: [
      { title: "系統設定", url: "/hq?tab=system&section=settings", icon: Settings },
      { title: "操作日誌", url: "/hq?tab=system&section=logs", icon: FileText },
      { title: "系統健康監控", url: "/hq?tab=system&section=health", icon: Activity },
      { title: "民宿 API Keys", url: "/hq?tab=system&section=api-keys", icon: FileText },
      { title: "奧丁丁服務帳號", url: "/hq?tab=system&section=owlting", icon: FileText },
      { title: "奧丁丁物業設定", url: "/hq?tab=system&section=owlting-config", icon: FileText },
      { title: "奧丁丁推送監控", url: "/hq?tab=system&section=owlting-push", icon: Activity },
      { title: "旭海房型驗證", url: "/hq?tab=system&section=hotelnabe-verify", icon: Activity },
      { title: "旭海收訂單記錄", url: "/hq?tab=system&section=hotelnabe-inbound", icon: Inbox },
      { title: "業主聯絡人", url: "/hq?tab=system&section=owners", icon: UserCheck },
    ]
  },
];

export function HQSidebar() {
  const { setOpenMobile, isMobile, state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const currentTab = searchParams.get('tab') || 'overview';
  const currentSection = searchParams.get('section');

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const isActiveRoute = (tab: string) => {
    if (tab === 'overview') {
      return currentTab === 'overview' || !searchParams.has('tab');
    }
    return currentTab === tab;
  };

  const isActiveSubItem = (url: string) => {
    const urlParams = new URLSearchParams(url.split('?')[1] || '');
    const urlTab = urlParams.get('tab');
    const urlSection = urlParams.get('section');
    return currentTab === urlTab && currentSection === urlSection;
  };

  return (
    <Sidebar collapsible="icon" className="admin-theme border-r">
      {!collapsed && (
        <SidebarHeader className="border-b px-6 py-4">
          <PreloadLink 
            to="/hq" 
            onClick={handleLinkClick}
            className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity duration-200"
          >
            <div className="flex items-center gap-2">
              <img src={lokezeLogo} alt="Lokeze" className="h-8 object-contain" />
              <span className="text-sm font-medium text-muted-foreground">總部</span>
            </div>
          </PreloadLink>
        </SidebarHeader>
      )}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2.5">
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {item.subItems ? (
                    <Collapsible defaultOpen={isActiveRoute(item.tab)} className="group/collapsible">
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton 
                          className="h-12 py-3 text-base"
                          isActive={isActiveRoute(item.tab)}
                        >
                          <item.icon className="h-5 w-5" />
                          <span>{item.title}</span>
                          <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="overflow-hidden transition-all duration-300 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                        <SidebarMenuSub className="ml-2 border-l-2 border-sidebar-border px-0 space-y-1 mt-1">
                          {item.subItems.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton asChild className="h-10 px-4 pl-8 hover:bg-sidebar-accent/50 transition-all duration-200">
                                <PreloadLink 
                                  to={subItem.url}
                                  onClick={handleLinkClick}
                                  className={isActiveSubItem(subItem.url) ? "bg-sidebar-accent" : ""}
                                >
                                  <subItem.icon className="h-4 w-4" />
                                  <span>{subItem.title}</span>
                                </PreloadLink>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </Collapsible>
                  ) : (
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActiveRoute(item.tab)} 
                      className="h-12 py-3 text-base"
                    >
                      <PreloadLink 
                        to={item.url}
                        onClick={handleLinkClick}
                      >
                        <item.icon className="h-5 w-5" />
                        <span>{item.title}</span>
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
