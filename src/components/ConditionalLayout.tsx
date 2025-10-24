import { useLocation, Outlet } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";

export function ConditionalLayout() {
  const location = useLocation();
  const isBookingPage = location.pathname === "/booking";

  // 前台訂房頁面：不使用任何 layout
  if (isBookingPage) {
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
          </div>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
