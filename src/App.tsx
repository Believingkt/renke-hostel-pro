import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";
import Dashboard from "./pages/Dashboard";
import Reception from "./pages/Reception";
import Orders from "./pages/Orders";
import BasicInfo from "./pages/BasicInfo";
import Pricing from "./pages/Pricing";
import Accounts from "./pages/Accounts";
import KolDiscount from "./pages/KolDiscount";
import Availability from "./pages/Availability";
import Booking from "./pages/Booking";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SidebarProvider>
          <div className="flex min-h-screen w-full">
            <AppSidebar />
            <div className="flex flex-1 flex-col">
              <Header />
              <main className="flex-1 p-3 md:p-6 overflow-x-hidden">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/reception" element={<Reception />} />
                  <Route path="/orders" element={<Orders />} />
                  <Route path="/basic-info" element={<BasicInfo />} />
                  <Route path="/pricing" element={<Pricing />} />
                  <Route path="/accounts" element={<Accounts />} />
                  <Route path="/discount-codes" element={<KolDiscount />} />
                  <Route path="/availability" element={<Availability />} />
                  <Route path="/booking" element={<Booking />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </main>
            </div>
          </div>
        </SidebarProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
