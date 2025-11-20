import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { ConditionalLayout } from "@/components/ConditionalLayout";
import { AccommodationProvider } from "@/contexts/AccommodationContext";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import { FrontendSkeleton } from "@/components/skeletons/FrontendSkeleton";
import { NetworkIndicator } from "@/components/NetworkIndicator";
import { PageTransition } from "@/components/PageTransition";
import { ChunkErrorBoundary } from "@/components/ChunkErrorBoundary";

// 路由懶加載 - 前台頁面
const Index = lazy(() => import("./pages/Index"));
const BookingFlow = lazy(() => import("./pages/BookingFlow"));
const OrderSearch = lazy(() => import("./pages/OrderSearch"));
const NotFound = lazy(() => import("./pages/NotFound"));
const OgImagePreview = lazy(() => import("./pages/OgImagePreview"));

// 路由懶加載 - 後台管理頁面
const Dashboard = lazy(() => import("./pages/Dashboard"));
const WebsiteContent = lazy(() => import("./pages/WebsiteContent"));
const Faq = lazy(() => import("./pages/Faq"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderDetail = lazy(() => import("./pages/OrderDetail"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Accounts = lazy(() => import("./pages/Accounts"));
const KolDiscount = lazy(() => import("./pages/KolDiscount"));
const DiscountCodeOrders = lazy(() => import("./pages/DiscountCodeOrders"));
const UserRoles = lazy(() => import("./pages/UserRoles"));
const Headquarters = lazy(() => import("./pages/Headquarters"));
const Customers = lazy(() => import("./pages/Customers"));
const CustomerOrders = lazy(() => import("./pages/CustomerOrders"));
const PublicHolidays = lazy(() => import("./pages/PublicHolidays"));
const Notifications = lazy(() => import("./pages/Notifications"));
const DataBackup = lazy(() => import("./pages/DataBackup"));

// Auth 頁面保持即時載入（關鍵路徑）
import Auth from "./pages/Auth";
import ChangePassword from "./pages/ChangePassword";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      networkMode: 'offlineFirst', // 優先使用緩存
    },
    mutations: {
      networkMode: 'online',
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AccommodationProvider>
        <BrowserRouter>
          <NetworkIndicator />
          <PageTransition>
            <ChunkErrorBoundary>
              <Suspense fallback={<FrontendSkeleton />}>
                <Routes>
              <Route element={<ConditionalLayout />}>
                <Route path="/" element={<Index />} />
                <Route path="/booking" element={<BookingFlow />} />
                <Route path="/order-search" element={<OrderSearch />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/change-password" element={<ChangePassword />} />
                <Route path="/hq" element={<Headquarters />} />
                <Route 
                  path="/admin" 
                  element={
                    <Suspense fallback={<DashboardSkeleton />}>
                      <Dashboard />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/website-content" 
                  element={
                    <Suspense fallback={<DashboardSkeleton />}>
                      <WebsiteContent />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/faq" 
                  element={
                    <Suspense fallback={<DashboardSkeleton />}>
                      <Faq />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/orders" 
                  element={
                    <Suspense fallback={<DashboardSkeleton />}>
                      <Orders />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/orders/:orderId" 
                  element={
                    <Suspense fallback={<DashboardSkeleton />}>
                      <OrderDetail />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/pricing" 
                  element={
                    <Suspense fallback={<DashboardSkeleton />}>
                      <Pricing />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/accounts" 
                  element={
                    <Suspense fallback={<DashboardSkeleton />}>
                      <Accounts />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/discount-codes" 
                  element={
                    <Suspense fallback={<DashboardSkeleton />}>
                      <KolDiscount />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/discount-codes/:discountCode/orders" 
                  element={
                    <Suspense fallback={<DashboardSkeleton />}>
                      <DiscountCodeOrders />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/user-roles" 
                  element={
                    <Suspense fallback={<DashboardSkeleton />}>
                      <UserRoles />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/customers" 
                  element={
                    <Suspense fallback={<DashboardSkeleton />}>
                      <Customers />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/customers/:customerId/orders" 
                  element={
                    <Suspense fallback={<DashboardSkeleton />}>
                      <CustomerOrders />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/notifications" 
                  element={
                    <Suspense fallback={<DashboardSkeleton />}>
                      <Notifications />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/public-holidays" 
                  element={
                    <Suspense fallback={<DashboardSkeleton />}>
                      <PublicHolidays />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/backup" 
                  element={
                    <Suspense fallback={<DashboardSkeleton />}>
                      <DataBackup />
                    </Suspense>
                  } 
                />
                <Route path="/og-preview" element={<OgImagePreview />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
          </ChunkErrorBoundary>
          </PageTransition>
        </BrowserRouter>
      </AccommodationProvider>
    </QueryClientProvider>
  );
}

export default App;
