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
import { HQDomainRedirect } from "@/components/HQDomainRedirect";

const { Suspense } = React;

// 前台頁面
import Index from "./pages/Index";
import BookingFlow from "./pages/BookingFlow";
import LinePayConfirm from "./pages/LinePayConfirm";
import AIBooking from "./pages/AIBooking";
import OrderSearch from "./pages/OrderSearch";
import Profile from "./pages/Profile";
import PaymentTest from "./pages/PaymentTest";
import PublicPayment from "./pages/PublicPayment";
import OrderPayment from "./pages/OrderPayment";
import PaymentResult from "./pages/PaymentResult";
import NotFound from "./pages/NotFound";
import OgImagePreview from "./pages/OgImagePreview";
import KolApiDocs from "./pages/KolApiDocs";

// 後台管理頁面
import Dashboard from "./pages/Dashboard";
import WebsiteContent from "./pages/WebsiteContent";
import Faq from "./pages/Faq";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import Pricing from "./pages/Pricing";
import RoomInventory from "./pages/RoomInventory";
import RoomPriceCalendar from "./pages/RoomPriceCalendar";
import Accounts from "./pages/Accounts";
import KolDiscount from "./pages/KolDiscount";
import DiscountCodeOrders from "./pages/DiscountCodeOrders";
import UserRoles from "./pages/UserRoles";
import Headquarters from "./pages/Headquarters";
import Customers from "./pages/Customers";
import CustomerOrders from "./pages/CustomerOrders";
import PublicHolidays from "./pages/PublicHolidays";
import Notifications from "./pages/Notifications";
import DataBackup from "./pages/DataBackup";
import EmailTest from "./pages/EmailTest";
import Settlement from "./pages/Settlement";
import Analytics from "./pages/Analytics";

// Auth 頁面 - 關鍵路徑
import Auth from "./pages/Auth";
import HQAuth from "./pages/HQAuth";
import ChangePassword from "./pages/ChangePassword";
import ResetPassword from "./pages/ResetPassword";

function App() {
  return (
    <BrowserRouter>
      <AccommodationProvider>
        <HQDomainRedirect>
          <NetworkIndicator />
          <PageTransition>
            <ChunkErrorBoundary>
              <Routes>
                <Route element={<ConditionalLayout />}>
                {/* 前台頁面 */}
                <Route path="/__cb/:ts" element={<Index />} />
                <Route path="/" element={<Index />} />
                <Route path="/booking" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <BookingFlow />
                  </Suspense>
                } />
                <Route path="/booking/linepay-confirm" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <LinePayConfirm />
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
                <Route path="/profile" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <Profile />
                  </Suspense>
                } />
                <Route path="/payment-test" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <PaymentTest />
                  </Suspense>
                } />
                <Route path="/kol-api-docs" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <KolApiDocs />
                  </Suspense>
                } />
                <Route path="/pay" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <PublicPayment />
                  </Suspense>
                } />
                <Route path="/pay/order" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <OrderPayment />
                  </Suspense>
                } />
                <Route path="/payment-result" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <PaymentResult />
                  </Suspense>
                } />
                
                {/* Auth 頁面 - 無需骨架屏 */}
                <Route path="/auth" element={<Auth />} />
                <Route path="/hq-auth" element={<HQAuth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/change-password" element={<ChangePassword />} />
                <Route path="/admin/change-password" element={<ChangePassword />} />
                <Route path="/headquarters/change-password" element={<ChangePassword />} />
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
                  path="/admin/pricing" 
                  element={
                    <Suspense fallback={<FormSkeleton fields={8} />}>
                      <Pricing />
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
                  path="/admin/room-price-calendar" 
                  element={
                    <Suspense fallback={<TableSkeleton rows={8} columns={15} />}>
                      <RoomPriceCalendar />
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
                  path="/admin/settlement" 
                  element={
                    <Suspense fallback={<TableSkeleton rows={8} columns={6} />}>
                      <Settlement />
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
                <Route 
                  path="/admin/analytics" 
                  element={
                    <Suspense fallback={<DashboardSkeleton />}>
                      <Analytics />
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
        </HQDomainRedirect>
      </AccommodationProvider>
    </BrowserRouter>
  );
}

export default App;
