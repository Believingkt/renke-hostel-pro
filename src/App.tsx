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
import { BookingDomainRedirect } from "@/components/BookingDomainRedirect";
import { AliasResolver } from "@/components/AliasResolver";
import { RequireModule } from "@/components/RequireModule";

const { Suspense, lazy } = React;

// 前台首頁 - 關鍵路徑，直接 import
import Index from "./pages/Index";

// Auth 頁面 - 關鍵路徑，直接 import
import Auth from "./pages/Auth";
import HQAuth from "./pages/HQAuth";
import TeamAuth from "./pages/TeamAuth";

// 平台入口 & 會員頁面 - lazy load
const BookingPortal = lazy(() => import("./pages/BookingPortal"));
const BookingSearchResults = lazy(() => import("./pages/BookingSearchResults"));
const BookingAccommodation = lazy(() => import("./pages/BookingAccommodation"));
const BookingVilla = lazy(() => import("./pages/BookingVilla"));
const VillaLanding = lazy(() => import("./pages/VillaLanding"));
const MemberAuth = lazy(() => import("./pages/MemberAuth"));
const MemberLayout = lazy(() => import("./components/member/MemberLayout"));
const MemberProfile = lazy(() => import("./pages/MemberProfile"));
const MemberPoints = lazy(() => import("./pages/MemberPoints"));
const MemberCoupons = lazy(() => import("./pages/MemberCoupons"));
const MemberOrders = lazy(() => import("./pages/MemberOrders"));
const MemberResetPassword = lazy(() => import("./pages/MemberResetPassword"));
const MemberLineCallback = lazy(() => import("./pages/MemberLineCallback"));
const MemberFacebookCallback = lazy(() => import("./pages/MemberFacebookCallback"));

// 前台頁面 - lazy load
const BookingFlow = lazy(() => import("./pages/BookingFlow"));
const LinePayConfirm = lazy(() => import("./pages/LinePayConfirm"));
const AIBooking = lazy(() => import("./pages/AIBooking"));
const OrderSearch = lazy(() => import("./pages/OrderSearch"));
const Profile = lazy(() => import("./pages/Profile"));
const PaymentTest = lazy(() => import("./pages/PaymentTest"));
const PublicPayment = lazy(() => import("./pages/PublicPayment"));
const OrderPayment = lazy(() => import("./pages/OrderPayment"));
const AtmBookingSuccess = lazy(() => import("./pages/AtmBookingSuccess"));
const DepositCardBind = lazy(() => import("./pages/DepositCardBind"));
const PaymentResult = lazy(() => import("./pages/PaymentResult"));
const NotFound = lazy(() => import("./pages/NotFound"));
const OgImagePreview = lazy(() => import("./pages/OgImagePreview"));
const KolApiDocs = lazy(() => import("./pages/KolApiDocs"));
const PointsApiDocs = lazy(() => import("./pages/PointsApiDocs"));
const AccommodationApiDocs = lazy(() => import("./pages/AccommodationApiDocs"));
const AccommodationAiApiDocs = lazy(() => import("./pages/AccommodationAiApiDocs"));
const OwlTingCmDocs = lazy(() => import("./pages/OwlTingCmDocs"));
const ApiDocsHub = lazy(() => import("./pages/ApiDocsHub"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Privacy = lazy(() => import("./pages/Privacy"));
const DataDeletion = lazy(() => import("./pages/DataDeletion"));

// 後台管理頁面 - lazy load
const Dashboard = lazy(() => import("./pages/Dashboard"));
const WebsiteContent = lazy(() => import("./pages/WebsiteContent"));
const Faq = lazy(() => import("./pages/Faq"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderDetail = lazy(() => import("./pages/OrderDetail"));
const Pricing = lazy(() => import("./pages/Pricing"));
const AdminPackages = lazy(() => import("./pages/AdminPackages"));
const AdminPackagesPreview = lazy(() => import("./pages/AdminPackagesPreview"));
const AdminSearchCard = lazy(() => import("./pages/AdminSearchCard"));
const RoomInventory = lazy(() => import("./pages/RoomInventory"));
const KolReciprocalQuota = lazy(() => import("./pages/admin/KolReciprocalQuota"));
const RoomPriceCalendar = lazy(() => import("./pages/RoomPriceCalendar"));

const Accounts = lazy(() => import("./pages/Accounts"));
const PermissionTemplates = lazy(() => import("./pages/PermissionTemplates"));
const KolDiscount = lazy(() => import("./pages/KolDiscount"));
const DiscountCodeOrders = lazy(() => import("./pages/DiscountCodeOrders"));
const KolDiscountDetail = lazy(() => import("./pages/KolDiscountDetail"));
const UserRoles = lazy(() => import("./pages/UserRoles"));
const Headquarters = lazy(() => import("./pages/Headquarters"));
const TeamLayout = lazy(() => import("./components/team/TeamLayout"));
const TeamHome = lazy(() => import("./pages/team/TeamHome"));
const TeamPlaceholder = lazy(() => import("./pages/team/TeamPlaceholder"));
const TeamOrders = lazy(() => import("./pages/team/TeamOrders"));
const TeamMembers = lazy(() => import("./pages/team/TeamMembers"));
const TeamKOL = lazy(() => import("./pages/team/TeamKOL"));
const TeamKolVenueConfirm = lazy(() => import("./pages/team/TeamKolVenueConfirm"));
const TeamCommission = lazy(() => import("./pages/team/TeamCommission"));
const KolBonus = lazy(() => import("./pages/team/KolBonus"));
const KolBonusPublic = lazy(() => import("./pages/team/KolBonusPublic"));
const TeamNotification = lazy(() => import("./pages/team/TeamNotification"));
const TeamAds = lazy(() => import("./pages/team/TeamAds"));
const TeamFranchise = lazy(() => import("./pages/team/TeamFranchise"));
const TeamStarlink = lazy(() => import("./pages/team/TeamStarlink"));
const TeamLineOA = lazy(() => import("./pages/team/TeamLineOA"));
const Customers = lazy(() => import("./pages/Customers"));
const CustomerOrders = lazy(() => import("./pages/CustomerOrders"));
const PublicHolidays = lazy(() => import("./pages/PublicHolidays"));
const Notifications = lazy(() => import("./pages/Notifications"));
const DataBackup = lazy(() => import("./pages/DataBackup"));
const EmailTest = lazy(() => import("./pages/EmailTest"));
const EmailPreview = lazy(() => import("./pages/EmailPreview"));
const Settlement = lazy(() => import("./pages/Settlement"));
const OwnerSettlement = lazy(() => import("./pages/OwnerSettlement"));
const OwnerSettlementSettings = lazy(() => import("./pages/OwnerSettlementSettings"));
const AddonCenter = lazy(() => import("./pages/AddonCenter"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Reception = lazy(() => import("./pages/Reception"));
const ChannelManager = lazy(() => import("./pages/ChannelManager"));
const OwlTingEmailIngest = lazy(() => import("./pages/OwlTingEmailIngest"));
const OwlTingFieldMappingCheck = lazy(() => import("./pages/OwlTingFieldMappingCheck"));
const OwlTingFillup = lazy(() => import("./pages/OwlTingFillup"));

// AI 助理訓練中心 (Phase 2)
const AiTrainingLayout = lazy(() => import("./pages/ai-training/AiTrainingLayout"));
const AiTrainingDashboard = lazy(() => import("./pages/ai-training/AiTrainingDashboard"));
const AiTrainingPlaceholder = lazy(() => import("./pages/ai-training/AiTrainingPlaceholder"));
const AiTrainingPrompt = lazy(() => import("./pages/ai-training/AiTrainingPrompt"));
const AiTrainingKnowledge = lazy(() => import("./pages/ai-training/AiTrainingKnowledge"));
const AiTrainingExamples = lazy(() => import("./pages/ai-training/AiTrainingExamples"));
const AiTrainingConversations = lazy(() => import("./pages/ai-training/AiTrainingConversations"));
const AiTrainingPlayground = lazy(() => import("./pages/ai-training/AiTrainingPlayground"));
const AiTrainingVersions = lazy(() => import("./pages/ai-training/AiTrainingVersions"));

// 民宿後台 AI 管家訓練中心
const AdminAiTrainingLayout = lazy(() => import("./pages/admin/ai-training/AdminAiTrainingLayout"));
const AdminAiTrainingDashboard = lazy(() => import("./pages/admin/ai-training/AdminAiTrainingDashboard"));
const AdminAiTrainingPrompt = lazy(() => import("./pages/admin/ai-training/AdminAiTrainingPrompt"));
const AdminAiTrainingKnowledge = lazy(() => import("./pages/admin/ai-training/AdminAiTrainingKnowledge"));
const AdminAiTrainingExamples = lazy(() => import("./pages/admin/ai-training/AdminAiTrainingExamples"));
const AdminAiTrainingConversations = lazy(() => import("./pages/admin/ai-training/AdminAiTrainingConversations"));
const AdminAiTrainingPlayground = lazy(() => import("./pages/admin/ai-training/AdminAiTrainingPlayground"));
const AdminAiTrainingApiKeys = lazy(() => import("./pages/admin/ai-training/AdminAiTrainingApiKeys"));
const AdminAiTrainingApiDocs = lazy(() => import("./pages/admin/ai-training/AdminAiTrainingApiDocs"));


function App() {
  return (
    <BrowserRouter>
      <AccommodationProvider>
        <HQDomainRedirect>
        <BookingDomainRedirect>
          <NetworkIndicator />
          <PageTransition>
            <ChunkErrorBoundary>
              {(() => {
                // 共用子路由：可掛在根層或 /:alias/* 之下
                const sharedRoutes = (
                  <>
                    {/* 平台入口 & 會員頁面 */}
                    <Route path="booking" element={
                      <Suspense fallback={null}><BookingPortal /></Suspense>
                    } />
                    <Route path="booking/search" element={
                      <Suspense fallback={<FrontendSkeleton />}><BookingSearchResults /></Suspense>
                    } />
                    <Route path="booking/villa/:accId" element={
                      <Suspense fallback={<FrontendSkeleton />}><BookingVilla /></Suspense>
                    } />
                    <Route path="villa/:accId" element={
                      <Suspense fallback={<FrontendSkeleton />}><VillaLanding /></Suspense>
                    } />
                    <Route path="booking/:accId" element={
                      <Suspense fallback={<FrontendSkeleton />}><BookingAccommodation /></Suspense>
                    } />
                    <Route path="member/auth" element={
                      <Suspense fallback={<FrontendSkeleton />}><MemberAuth /></Suspense>
                    } />
                    <Route path="member" element={
                      <Suspense fallback={<FrontendSkeleton />}><MemberLayout /></Suspense>
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
                    <Route path="member/reset-password" element={
                      <Suspense fallback={<FrontendSkeleton />}><MemberResetPassword /></Suspense>
                    } />
                    <Route path="member/auth/line-callback" element={
                      <Suspense fallback={<FrontendSkeleton />}><MemberLineCallback /></Suspense>
                    } />
                    <Route path="member/auth/facebook-callback" element={
                      <Suspense fallback={<FrontendSkeleton />}><MemberFacebookCallback /></Suspense>
                    } />

                    {/* 前台頁面 */}
                    <Route path="__cb/:ts" element={<Index />} />
                    <Route path="owlting-fillup/:token" element={
                      <Suspense fallback={null}><OwlTingFillup /></Suspense>
                    } />
                    <Route index element={<Index />} />
                    <Route path="book" element={
                      <Suspense fallback={<FrontendSkeleton />}><BookingFlow /></Suspense>
                    } />
                    <Route path="book/linepay-confirm" element={
                      <Suspense fallback={<FrontendSkeleton />}><LinePayConfirm /></Suspense>
                    } />
                    <Route path="ai-booking" element={
                      <Suspense fallback={<FrontendSkeleton />}><AIBooking /></Suspense>
                    } />
                    <Route path="order-search" element={
                      <Suspense fallback={<FrontendSkeleton />}><OrderSearch /></Suspense>
                    } />
                    <Route path="profile" element={
                      <Suspense fallback={<FrontendSkeleton />}><Profile /></Suspense>
                    } />
                    <Route path="payment-test" element={
                      <Suspense fallback={<FrontendSkeleton />}><PaymentTest /></Suspense>
                    } />
                    <Route path="api-docs" element={
                      <Suspense fallback={<FrontendSkeleton />}><ApiDocsHub /></Suspense>
                    } />
                    <Route path="api-docs/kol" element={
                      <Suspense fallback={<FrontendSkeleton />}><KolApiDocs /></Suspense>
                    } />
                    <Route path="api-docs/points" element={
                      <Suspense fallback={<FrontendSkeleton />}><PointsApiDocs /></Suspense>
                    } />
                    <Route path="api-docs/accommodation" element={
                      <Suspense fallback={<FrontendSkeleton />}><AccommodationApiDocs /></Suspense>
                    } />
                    <Route path="kol-api-docs" element={
                      <Suspense fallback={<FrontendSkeleton />}><KolApiDocs /></Suspense>
                    } />
                    <Route path="points-api-docs" element={
                      <Suspense fallback={<FrontendSkeleton />}><PointsApiDocs /></Suspense>
                    } />
                    <Route path="accommodation-api-docs" element={
                      <Suspense fallback={<FrontendSkeleton />}><AccommodationApiDocs /></Suspense>
                    } />
                    <Route path="docs/accommodation-api" element={
                      <Suspense fallback={<FrontendSkeleton />}><AccommodationApiDocs /></Suspense>
                    } />
                    <Route path="docs/owlting-cm" element={
                      <Suspense fallback={<FrontendSkeleton />}><OwlTingCmDocs /></Suspense>
                    } />
                    <Route path="api-docs/owlting-cm" element={
                      <Suspense fallback={<FrontendSkeleton />}><OwlTingCmDocs /></Suspense>
                    } />
                    <Route path="api-docs/accommodation-ai" element={
                      <Suspense fallback={<FrontendSkeleton />}><AccommodationAiApiDocs /></Suspense>
                    } />
                    <Route path="accommodation-ai-api-docs" element={
                      <Suspense fallback={<FrontendSkeleton />}><AccommodationAiApiDocs /></Suspense>
                    } />
                    <Route path="pay" element={
                      <Suspense fallback={<FrontendSkeleton />}><PublicPayment /></Suspense>
                    } />
                    <Route path="pay/order" element={
                      <Suspense fallback={<FrontendSkeleton />}><OrderPayment /></Suspense>
                    } />
                    <Route path="booking/atm-info" element={
                      <Suspense fallback={<FrontendSkeleton />}><AtmBookingSuccess /></Suspense>
                    } />
                    <Route path="pay/bind-card" element={
                      <Suspense fallback={<FrontendSkeleton />}><DepositCardBind /></Suspense>
                    } />
                    <Route path="payment-result" element={
                      <Suspense fallback={<FrontendSkeleton />}><PaymentResult /></Suspense>
                    } />
                    <Route path="privacy" element={
                      <Suspense fallback={<FrontendSkeleton />}><Privacy /></Suspense>
                    } />
                    <Route path="data-deletion" element={
                      <Suspense fallback={<FrontendSkeleton />}><DataDeletion /></Suspense>
                    } />


                    {/* Auth 頁面 */}
                    <Route path="auth" element={<Auth />} />
                    <Route path="reset-password" element={
                      <Suspense fallback={<FrontendSkeleton />}><ResetPassword /></Suspense>
                    } />
                    <Route path="change-password" element={
                      <Suspense fallback={<FrontendSkeleton />}><ChangePassword /></Suspense>
                    } />
                    <Route path="admin/change-password" element={
                      <Suspense fallback={<FrontendSkeleton />}><ChangePassword /></Suspense>
                    } />

                    {/* 後台管理頁面 */}
                    <Route path="admin" element={
                      <RequireModule module="analytics">
                        <Suspense fallback={<DashboardSkeleton />}><Dashboard /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/website-content" element={
                      <RequireModule module="website_content">
                        <Suspense fallback={<FormSkeleton fields={12} hasImage={true} />}><WebsiteContent /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/faq" element={
                      <RequireModule module="website_content">
                        <Suspense fallback={<FormSkeleton fields={3} />}><Faq /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/orders" element={
                      <RequireModule module="orders">
                        <Suspense fallback={<TableSkeleton rows={10} columns={8} />}><Orders /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/orders/:orderId" element={
                      <RequireModule module="orders">
                        <Suspense fallback={<DetailSkeleton sections={4} />}><OrderDetail /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/pricing" element={
                      <RequireModule module="pricing">
                        <Suspense fallback={<FormSkeleton fields={8} />}><Pricing /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/projects" element={
                      <RequireModule module="room_price">
                        <Suspense fallback={<FormSkeleton fields={8} />}><Pricing /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/holidays" element={
                      <RequireModule module="room_price">
                        <Suspense fallback={<FormSkeleton fields={8} />}><Pricing /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/packages" element={
                      <RequireModule module="room_price">
                        <Suspense fallback={<FormSkeleton fields={8} />}><AdminPackages /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/packages-preview" element={
                      <RequireModule module="room_price">
                        <Suspense fallback={<FormSkeleton fields={4} />}><AdminPackagesPreview /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/room-inventory" element={
                      <RequireModule module="orders">
                        <Suspense fallback={<FormSkeleton fields={6} />}><RoomInventory /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/kol-reciprocal-quota" element={
                      <RequireModule module="kol_quota">
                        <Suspense fallback={<FormSkeleton fields={4} />}><KolReciprocalQuota /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/room-price-calendar" element={
                      <RequireModule module="room_price">
                        <Suspense fallback={<TableSkeleton rows={8} columns={15} />}><RoomPriceCalendar /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/search-card" element={
                      <RequireModule module="room_price">
                        <Suspense fallback={<FormSkeleton fields={6} />}><AdminSearchCard /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/accounts" element={
                      <RequireModule module="accounts">
                        <Suspense fallback={<FormSkeleton fields={4} />}><Accounts /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/permission-templates" element={
                      <RequireModule module="accounts">
                        <Suspense fallback={<FormSkeleton fields={4} />}><PermissionTemplates /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/discount-codes" element={
                      <RequireModule module="discount_codes">
                        <Suspense fallback={<TableSkeleton rows={8} columns={7} />}><KolDiscount /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/discount-codes/:discountCodeId/detail" element={
                      <RequireModule module="discount_codes">
                        <Suspense fallback={<TableSkeleton rows={8} columns={7} />}><KolDiscountDetail /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/discount-codes/:discountCode/orders" element={
                      <RequireModule module="discount_codes">
                        <Suspense fallback={<TableSkeleton rows={10} columns={7} />}><DiscountCodeOrders /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/user-roles" element={
                      <RequireModule module="accounts">
                        <Suspense fallback={<TableSkeleton rows={8} columns={4} />}><UserRoles /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/customers" element={
                      <RequireModule module="customers">
                        <Suspense fallback={<TableSkeleton rows={10} columns={6} />}><Customers /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/customers/:customerId/orders" element={
                      <RequireModule module="customers">
                        <Suspense fallback={<TableSkeleton rows={10} columns={7} />}><CustomerOrders /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/notifications" element={
                      <RequireModule module="orders">
                        <Suspense fallback={<TableSkeleton rows={8} columns={4} showFilters={false} />}><Notifications /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/public-holidays" element={
                      <RequireModule module="room_price">
                        <Suspense fallback={<FormSkeleton fields={2} />}><PublicHolidays /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/backup" element={
                      <RequireModule module="accounts">
                        <Suspense fallback={<FormSkeleton fields={5} />}><DataBackup /></Suspense>
                      </RequireModule>
                    } />
                    {/* <Route path="admin/settlement" element={
                      <RequireModule module="settlement">
                        <Suspense fallback={<TableSkeleton rows={8} columns={6} />}><Settlement /></Suspense>
                      </RequireModule>
                    } /> */}
                    <Route path="admin/owner-settlement" element={
                      <RequireModule module="owner_settlement">
                        <Suspense fallback={<TableSkeleton rows={8} columns={8} />}><OwnerSettlement /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/owner-settlement/settings" element={
                      <RequireModule module="owner_settlement">
                        <Suspense fallback={<FormSkeleton fields={3} />}><OwnerSettlementSettings /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/addon-center" element={
                      <RequireModule module="addon_center">
                        <Suspense fallback={<TableSkeleton rows={8} columns={6} />}><AddonCenter /></Suspense>
                      </RequireModule>
                    } />

                    <Route path="admin/email-test" element={
                      <RequireModule module="accounts">
                        <Suspense fallback={<DashboardSkeleton />}><EmailTest /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/email-preview" element={
                      <RequireModule module="accounts">
                        <Suspense fallback={<DashboardSkeleton />}><EmailPreview /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/analytics" element={
                      <RequireModule module="analytics">
                        <Suspense fallback={<DashboardSkeleton />}><Analytics /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/reception" element={
                      <RequireModule module="reception">
                        <Suspense fallback={<DashboardSkeleton />}><Reception /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/channel-manager" element={
                      <RequireModule module="channel_manager">
                        <Suspense fallback={<DashboardSkeleton />}><ChannelManager /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/owlting-email-ingest" element={
                      <RequireModule module="channel_manager">
                        <Suspense fallback={<DashboardSkeleton />}><OwlTingEmailIngest /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/owlting-field-mapping-check" element={
                      <RequireModule module="channel_manager">
                        <Suspense fallback={<DashboardSkeleton />}><OwlTingFieldMappingCheck /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/ai-training" element={
                      <RequireModule module="ai_training">
                        <Suspense fallback={<DashboardSkeleton />}><AdminAiTrainingLayout /></Suspense>
                      </RequireModule>
                    }>
                      <Route index element={<Suspense fallback={null}><AdminAiTrainingDashboard /></Suspense>} />
                      <Route path="prompt" element={<Suspense fallback={null}><AdminAiTrainingPrompt /></Suspense>} />
                      <Route path="knowledge" element={<Suspense fallback={null}><AdminAiTrainingKnowledge /></Suspense>} />
                      <Route path="examples" element={<Suspense fallback={null}><AdminAiTrainingExamples /></Suspense>} />
                      <Route path="conversations" element={<Suspense fallback={null}><AdminAiTrainingConversations /></Suspense>} />
                      <Route path="playground" element={<Suspense fallback={null}><AdminAiTrainingPlayground /></Suspense>} />
                      <Route path="api-keys" element={<Suspense fallback={null}><AdminAiTrainingApiKeys /></Suspense>} />
                      <Route path="api-docs" element={<Suspense fallback={null}><AdminAiTrainingApiDocs /></Suspense>} />
                    </Route>

                    {/* 其他頁面 */}
                    <Route path="og-preview" element={
                      <Suspense fallback={<FrontendSkeleton />}><OgImagePreview /></Suspense>
                    } />
                  </>
                );

                return (
                  <Routes>
                    <Route element={<ConditionalLayout />}>
                      {/* 根層路由（向下相容） */}
                      {sharedRoutes}

                      {/* HQ 與 headquarters 路由（不放入 alias 樹下） */}
                      <Route path="/hq-auth" element={<HQAuth />} />
                      <Route path="/team-auth" element={<TeamAuth />} />
                      <Route path="/team/kol/bonus/:token" element={
                        <Suspense fallback={null}><KolBonusPublic /></Suspense>
                      } />
                      <Route path="/hq/ai-training" element={
                        <Suspense fallback={<DashboardSkeleton />}><AiTrainingLayout /></Suspense>
                      }>
                        <Route index element={
                          <Suspense fallback={null}><AiTrainingDashboard /></Suspense>
                        } />
                        <Route path="prompt" element={
                          <Suspense fallback={null}><AiTrainingPrompt /></Suspense>
                        } />
                        <Route path="knowledge" element={
                          <Suspense fallback={null}><AiTrainingKnowledge /></Suspense>
                        } />
                        <Route path="examples" element={
                          <Suspense fallback={null}><AiTrainingExamples /></Suspense>
                        } />
                        <Route path="conversations" element={
                          <Suspense fallback={null}><AiTrainingConversations /></Suspense>
                        } />
                        <Route path="playground" element={
                          <Suspense fallback={null}><AiTrainingPlayground /></Suspense>
                        } />
                        <Route path="versions" element={
                          <Suspense fallback={null}><AiTrainingVersions /></Suspense>
                        } />

                      </Route>
                      <Route path="/hq" element={
                        <Suspense fallback={<DashboardSkeleton />}><Headquarters /></Suspense>
                      } />
                      <Route path="/team" element={
                        <Suspense fallback={<DashboardSkeleton />}><TeamLayout /></Suspense>
                      }>
                        <Route index element={
                          <Suspense fallback={null}><TeamHome /></Suspense>
                        } />
                        <Route path="members" element={
                          <Suspense fallback={null}><TeamMembers /></Suspense>
                        } />
                        <Route path="kol" element={
                          <Suspense fallback={null}><TeamKOL /></Suspense>
                        } />
                        <Route path="kol/venue-confirm" element={
                          <Suspense fallback={null}><TeamKolVenueConfirm /></Suspense>
                        } />
                        <Route path="kol/bonus" element={
                          <Suspense fallback={null}><KolBonus /></Suspense>
                        } />
                        <Route path="orders" element={
                          <Suspense fallback={null}><TeamOrders /></Suspense>
                        } />
                        <Route path="commission" element={
                          <Suspense fallback={null}><TeamCommission /></Suspense>
                        } />
                        <Route path="ads" element={
                          <Suspense fallback={null}><TeamAds /></Suspense>
                        } />
                        <Route path="notification" element={
                          <Suspense fallback={null}><TeamNotification /></Suspense>
                        } />
                        <Route path="franchise" element={
                          <Suspense fallback={null}><TeamFranchise /></Suspense>
                        } />
                        <Route path="starlink" element={
                          <Suspense fallback={null}><TeamStarlink /></Suspense>
                        } />
                        <Route path="lineoa" element={
                          <Suspense fallback={null}><TeamLineOA /></Suspense>
                        } />
                      </Route>
                      <Route path="/headquarters/change-password" element={
                        <Suspense fallback={<FrontendSkeleton />}><ChangePassword /></Suspense>
                      } />

                      {/* /:alias/* — booking.lakeze.com/{alias}/admin 等使用 */}
                      <Route path="/:alias" element={<AliasResolver />}>
                        {sharedRoutes}
                      </Route>

                      <Route path="*" element={
                        <Suspense fallback={<FrontendSkeleton />}><NotFound /></Suspense>
                      } />
                    </Route>
                  </Routes>
                );
              })()}
            </ChunkErrorBoundary>
          </PageTransition>
        </BookingDomainRedirect>
        </HQDomainRedirect>
      </AccommodationProvider>
    </BrowserRouter>
  );
}

export default App;
