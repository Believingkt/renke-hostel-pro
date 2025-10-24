import { useLocation, Outlet } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";

export function ConditionalLayout() {
  const location = useLocation();
  const isFrontendPage = location.pathname === "/";
  const isAdminPage = location.pathname.startsWith("/admin");

  // 前台頁面：不使用任何 layout
  if (isFrontendPage) {
    return (
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Outlet />
      </TooltipProvider>
    );
  }

  // 非後台頁面也不使用 layout
  if (!isAdminPage) {
    return <Outlet />;
  }

  // PMS 後台頁面：使用完整 layout
  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <div className="flex flex-1 flex-col">
            <Header />
            <main className="flex-1 p-3 md:p-6 overflow-x-hidden">
              <Outlet />
            </main>
            <footer className="border-t py-4 px-3 md:px-6">
              <p className="text-sm text-center text-muted-foreground">
                © 2025 人客多 PMS 旅宿管理系統. 版權所有
              </p>
            </footer>
          </div>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
