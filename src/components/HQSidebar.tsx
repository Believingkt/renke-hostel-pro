import { 
  Building2, 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Users, 
  Settings,
  ChevronDown,
  LineChart,
  Landmark,
  Wrench
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
  { 
    title: "營運分析", 
    url: "/hq", 
    icon: BarChart3,
    subItems: [
      { title: "營運概況", url: "/hq?tab=overview", icon: BarChart3, tab: "overview" },
      { title: "業績報表", url: "/hq?tab=performance", icon: TrendingUp, tab: "performance" },
    ]
  },
  { 
    title: "財務管理", 
    url: "/hq?tab=split", 
    icon: Landmark,
    subItems: [
      { title: "金流拆帳", url: "/hq?tab=split", icon: DollarSign, tab: "split" },
    ]
  },
  { 
    title: "系統設定", 
    url: "/hq?tab=accommodations", 
    icon: Settings,
    subItems: [
      { title: "民宿管理", url: "/hq?tab=accommodations", icon: Building2, tab: "accommodations" },
      { title: "用戶管理", url: "/hq?tab=users", icon: Users, tab: "users" },
      { title: "系統管理", url: "/hq?tab=system", icon: Wrench, tab: "system" },
    ]
  },
];

export function HQSidebar() {
  const { open, setOpenMobile, isMobile } = useSidebar();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const currentTab = searchParams.get('tab') || 'overview';

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const isActiveSubItem = (tab: string) => {
    if (tab === 'overview') {
      return currentTab === 'overview' || !searchParams.has('tab');
    }
    return currentTab === tab;
  };

  const isGroupActive = (subItems: { tab: string }[]) => {
    return subItems.some(item => isActiveSubItem(item.tab));
  };

  return (
    <Sidebar collapsible="icon" className="border-r transition-all duration-300">
      <SidebarHeader className="border-b px-6 py-4 transition-all duration-300">
        <PreloadLink 
          to="/hq" 
          onClick={handleLinkClick}
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity duration-200"
        >
          {open && (
            <div className="animate-in fade-in-0 slide-in-from-left-5 duration-300 flex items-center gap-2">
              <img src={lokezeLogo} alt="Lokeze" className="h-8 object-contain" />
              <span className="text-sm font-medium text-muted-foreground">總部</span>
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
                  <Collapsible defaultOpen={isGroupActive(item.subItems)} className="group/collapsible">
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton className="h-12 py-3 text-base transition-all duration-200 hover:scale-[1.02]">
                        <item.icon className="h-5 w-5 transition-all duration-200 group-hover:scale-110" />
                        <span className="transition-all duration-200">{item.title}</span>
                        <ChevronDown className="ml-auto h-4 w-4 transition-all duration-300 ease-in-out group-data-[state=open]/collapsible:rotate-180 group-hover:scale-110" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="overflow-hidden transition-all duration-300 ease-in-out data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                      <SidebarMenuSub className="ml-2 border-l-2 border-sidebar-border px-0 space-y-1 mt-1">
                        {item.subItems.map((subItem, index) => (
                          <SidebarMenuSubItem 
                            key={subItem.title}
                            className="animate-in fade-in-0 slide-in-from-left-2"
                            style={{ animationDelay: `${index * 30}ms`, animationDuration: '200ms' }}
                          >
                            <SidebarMenuSubButton asChild className="h-10 px-4 pl-8 hover:bg-sidebar-accent/50 hover:translate-x-1 transition-all duration-200">
                              <PreloadLink 
                                to={subItem.url}
                                onClick={handleLinkClick}
                                className={isActiveSubItem(subItem.tab) ? "bg-sidebar-accent" : ""}
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
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
