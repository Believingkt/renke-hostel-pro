import * as React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ConditionalLayout } from "@/components/ConditionalLayout";
import { AccommodationProvider } from "@/contexts/AccommodationContext";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";
import { FormSkeleton } from "@/components/skeletons/FormSkeleton";
import { DetailSkeleton } from "@/components/skeletons/DetailSkeleton";
import { FrontendSkeleton } from "@/components/skeletons/FrontendSkeleton";
import { NetworkIndicator } from "@/components/NetworkIndicator";
import { PageTransition } from "@/components/PageTransition";
import { ChunkErrorBoundary } from "@/components/ChunkErrorBoundary";

const { lazy, Suspense } = React;

// 路由懶加載 - 前台頁面
const Index = lazy(() => import("./pages/Index"));
const BookingFlow = lazy(() => import("./pages/BookingFlow"));
const AIBooking = lazy(() => import("./pages/AIBooking"));
const OrderSearch = lazy(() => import("./pages/OrderSearch"));
const NotFound = lazy(() => import("./pages/NotFound"));
const OgImagePreview = lazy(() => import("./pages/OgImagePreview"));

// 路由懶加載 - 後台管理頁面
const Dashboard = lazy(() => import("./pages/Dashboard"));
const WebsiteContent = lazy(() => import("./pages/WebsiteContent"));
const Faq = lazy(() => import("./pages/Faq"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderDetail = lazy(() => import("./pages/OrderDetail"));

const RoomInventory = lazy(() => import("./pages/RoomInventory"));
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
const EmailTest = lazy(() => import("./pages/EmailTest"));

// Auth 頁面保持即時載入（關鍵路徑）
import Auth from "./pages/Auth";
import ChangePassword from "./pages/ChangePassword";

function App() {
  return (
    <BrowserRouter>
      <AccommodationProvider>
        <NetworkIndicator />
        <PageTransition>
          <ChunkErrorBoundary>
            <Routes>
              <Route element={<ConditionalLayout />}>
                {/* 前台頁面 - 使用 FrontendSkeleton */}
                <Route path="/" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <Index />
                  </Suspense>
                } />
                <Route path="/booking" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <BookingFlow />
                  </Suspense>
                } />
                <Route path="/ai-booking" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <AIBooking />
                  </Suspense>
                } />
                <Route path="/order-search" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <OrderSearch />
                  </Suspense>
                } />
                
                {/* Auth 頁面 - 無需骨架屏 */}
                <Route path="/auth" element={<Auth />} />
                <Route path="/change-password" element={<ChangePassword />} />
                <Route path="/admin/change-password" element={<ChangePassword />} />
                <Route path="/hq" element={<Headquarters />} />
                
                {/* 後台管理頁面 - 使用 DashboardSkeleton */}
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
                    <Suspense fallback={<FormSkeleton fields={12} hasImage={true} />}>
                      <WebsiteContent />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/faq" 
                  element={
                    <Suspense fallback={<FormSkeleton fields={3} />}>
                      <Faq />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/orders" 
                  element={
                    <Suspense fallback={<TableSkeleton rows={10} columns={8} />}>
                      <Orders />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/orders/:orderId" 
                  element={
                    <Suspense fallback={<DetailSkeleton sections={4} />}>
                      <OrderDetail />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/room-inventory" 
                  element={
                    <Suspense fallback={<FormSkeleton fields={6} />}>
                      <RoomInventory />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/accounts" 
                  element={
                    <Suspense fallback={<FormSkeleton fields={4} />}>
                      <Accounts />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/discount-codes" 
                  element={
                    <Suspense fallback={<TableSkeleton rows={8} columns={7} />}>
                      <KolDiscount />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/discount-codes/:discountCode/orders" 
                  element={
                    <Suspense fallback={<TableSkeleton rows={10} columns={7} />}>
                      <DiscountCodeOrders />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/user-roles" 
                  element={
                    <Suspense fallback={<TableSkeleton rows={8} columns={4} />}>
                      <UserRoles />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/customers" 
                  element={
                    <Suspense fallback={<TableSkeleton rows={10} columns={6} />}>
                      <Customers />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/customers/:customerId/orders" 
                  element={
                    <Suspense fallback={<TableSkeleton rows={10} columns={7} />}>
                      <CustomerOrders />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/notifications" 
                  element={
                    <Suspense fallback={<TableSkeleton rows={8} columns={4} showFilters={false} />}>
                      <Notifications />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/public-holidays" 
                  element={
                    <Suspense fallback={<FormSkeleton fields={2} />}>
                      <PublicHolidays />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/backup" 
                  element={
                    <Suspense fallback={<FormSkeleton fields={5} />}>
                      <DataBackup />
                    </Suspense>
                  } 
                />
                <Route 
                  path="/admin/email-test" 
                  element={
                    <Suspense fallback={<DashboardSkeleton />}>
                      <EmailTest />
                    </Suspense>
                  } 
                />
                
                {/* 其他頁面 */}
                <Route path="/og-preview" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <OgImagePreview />
                  </Suspense>
                } />
                <Route path="*" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <NotFound />
                  </Suspense>
                } />
              </Route>
            </Routes>
          </ChunkErrorBoundary>
        </PageTransition>
      </AccommodationProvider>
    </BrowserRouter>
  );
}

export default App;
