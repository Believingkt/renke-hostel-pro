import { 
  Building2, 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Users, 
  Settings,
  ChevronDown,
  Home
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
} from "@/components/ui/sidebar";
import lokezeLogo from "@/assets/lokeze-logo.png";

const menuItems = [
  { title: "營運概況", url: "/hq", icon: BarChart3, tab: "overview" },
  { title: "業績報表", url: "/hq?tab=performance", icon: TrendingUp, tab: "performance" },
  { title: "金流拆帳", url: "/hq?tab=split", icon: DollarSign, tab: "split" },
  { title: "民宿管理", url: "/hq?tab=accommodations", icon: Building2, tab: "accommodations" },
  { title: "用戶管理", url: "/hq?tab=users", icon: Users, tab: "users" },
  { title: "系統管理", url: "/hq?tab=system", icon: Settings, tab: "system" },
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

  const isActiveRoute = (tab: string) => {
    if (tab === 'overview') {
      return currentTab === 'overview' || !searchParams.has('tab');
    }
    return currentTab === tab;
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
                  <SidebarMenuButton 
                    asChild 
                    isActive={isActiveRoute(item.tab)} 
                    className="h-12 py-3 text-base transition-all duration-200 hover:scale-[1.02]"
                  >
                    <PreloadLink 
                      to={item.url}
                      onClick={handleLinkClick}
                    >
                      <item.icon className="h-5 w-5 transition-all duration-200 group-hover:scale-110" />
                      <span className="transition-all duration-200">{item.title}</span>
                    </PreloadLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
