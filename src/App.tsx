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

const { Suspense, lazy } = React;

// 前台首頁 - 關鍵路徑，直接 import
import Index from "./pages/Index";

// Auth 頁面 - 關鍵路徑，直接 import
import Auth from "./pages/Auth";
import HQAuth from "./pages/HQAuth";

// 平台入口 & 會員頁面 - lazy load
const BookingPortal = lazy(() => import("./pages/BookingPortal"));
const MemberAuth = lazy(() => import("./pages/MemberAuth"));
const MemberLayout = lazy(() => import("./components/member/MemberLayout"));
const MemberProfile = lazy(() => import("./pages/MemberProfile"));
const MemberPoints = lazy(() => import("./pages/MemberPoints"));
const MemberCoupons = lazy(() => import("./pages/MemberCoupons"));
const MemberOrders = lazy(() => import("./pages/MemberOrders"));
const MemberResetPassword = lazy(() => import("./pages/MemberResetPassword"));

// 前台頁面 - lazy load
const BookingFlow = lazy(() => import("./pages/BookingFlow"));
const LinePayConfirm = lazy(() => import("./pages/LinePayConfirm"));
const AIBooking = lazy(() => import("./pages/AIBooking"));
const OrderSearch = lazy(() => import("./pages/OrderSearch"));
const Profile = lazy(() => import("./pages/Profile"));
const PaymentTest = lazy(() => import("./pages/PaymentTest"));
const PublicPayment = lazy(() => import("./pages/PublicPayment"));
const OrderPayment = lazy(() => import("./pages/OrderPayment"));
const PaymentResult = lazy(() => import("./pages/PaymentResult"));
const NotFound = lazy(() => import("./pages/NotFound"));
const OgImagePreview = lazy(() => import("./pages/OgImagePreview"));
const KolApiDocs = lazy(() => import("./pages/KolApiDocs"));
const PointsApiDocs = lazy(() => import("./pages/PointsApiDocs"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

// 後台管理頁面 - lazy load
const Dashboard = lazy(() => import("./pages/Dashboard"));
const WebsiteContent = lazy(() => import("./pages/WebsiteContent"));
const Faq = lazy(() => import("./pages/Faq"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderDetail = lazy(() => import("./pages/OrderDetail"));
const Pricing = lazy(() => import("./pages/Pricing"));
const RoomInventory = lazy(() => import("./pages/RoomInventory"));
const RoomPriceCalendar = lazy(() => import("./pages/RoomPriceCalendar"));
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
const Settlement = lazy(() => import("./pages/Settlement"));
const Analytics = lazy(() => import("./pages/Analytics"));

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
                {/* 平台入口 & 會員頁面 */}
                <Route path="/booking" element={
                  <Suspense fallback={null}>
                    <BookingPortal />
                  </Suspense>
                } />
                <Route path="/member/auth" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <MemberAuth />
                  </Suspense>
                } />
                <Route path="/member" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <MemberLayout />
                  </Suspense>
                }>
                  <Route path="profile" element={
                    <Suspense fallback={<FrontendSkeleton />}><MemberProfile /></Suspense>
                  } />
                  <Route path="points" element={
                    <Suspense fallback={<FrontendSkeleton />}><MemberPoints /></Suspense>
                  } />
                  <Route path="coupons" element={
                    <Suspense fallback={<FrontendSkeleton />}><MemberCoupons /></Suspense>
                  } />
                  <Route path="orders" element={
                    <Suspense fallback={<FrontendSkeleton />}><MemberOrders /></Suspense>
                  } />
                </Route>
                <Route path="/member/reset-password" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <MemberResetPassword />
                  </Suspense>
                } />

                {/* 前台頁面 */}
                <Route path="/__cb/:ts" element={<Index />} />
                <Route path="/" element={<Index />} />
                <Route path="/book" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <BookingFlow />
                  </Suspense>
                } />
                <Route path="/book/linepay-confirm" element={
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
                <Route path="/points-api-docs" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <PointsApiDocs />
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
                
                {/* Auth 頁面 */}
                <Route path="/auth" element={<Auth />} />
                <Route path="/hq-auth" element={<HQAuth />} />
                <Route path="/reset-password" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <ResetPassword />
                  </Suspense>
                } />
                <Route path="/change-password" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <ChangePassword />
                  </Suspense>
                } />
                <Route path="/admin/change-password" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <ChangePassword />
                  </Suspense>
                } />
                <Route path="/headquarters/change-password" element={
                  <Suspense fallback={<FrontendSkeleton />}>
                    <ChangePassword />
                  </Suspense>
                } />
                <Route path="/hq" element={
                  <Suspense fallback={<DashboardSkeleton />}>
                    <Headquarters />
                  </Suspense>
                } />
                
                {/* 後台管理頁面 */}
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
