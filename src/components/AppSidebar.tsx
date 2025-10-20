import { 
  Building2,
  DoorOpen, 
  DollarSign, 
  Search, 
  ClipboardList, 
  Users, 
  BarChart3, 
  Settings,
  Tag
} from "lucide-react";
import { NavLink } from "react-router-dom";
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
} from "@/components/ui/sidebar";

const menuItems = [
  { title: "櫃檯接待", url: "/reception", icon: Users },
  { title: "營運報表", url: "/", icon: BarChart3 },
  { title: "基本資訊", url: "/basic-info", icon: Building2 },
  { title: "房價庫存設定", url: "/pricing", icon: DollarSign },
  { title: "空房查詢", url: "/availability", icon: Search },
  { title: "訂單查詢", url: "/orders", icon: ClipboardList },
  { title: "帳號權限管理", url: "/accounts", icon: Settings },
  { title: "KOL折扣代碼", url: "/discount-codes", icon: Tag },
];

export function AppSidebar() {
  const { open } = useSidebar();

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
                  <SidebarMenuButton asChild className="h-12 py-3 text-base">
                    <NavLink 
                      to={item.url}
                      className={({ isActive }) =>
                        isActive ? "bg-sidebar-accent" : ""
                      }
                    >
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
    </Sidebar>
  );
}
