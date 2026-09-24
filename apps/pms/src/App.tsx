import * as React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ConditionalLayout } from "@lakeze/shared/components/ConditionalLayout";
import { MovedToHQCard } from "@/components/MovedToHQCard";
import { AccommodationProvider } from "@lakeze/shared/contexts/AccommodationContext";
import { DashboardSkeleton } from "@lakeze/shared/components/skeletons/DashboardSkeleton";
import { TableSkeleton } from "@lakeze/shared/components/skeletons/TableSkeleton";
import { FormSkeleton } from "@lakeze/shared/components/skeletons/FormSkeleton";
import { DetailSkeleton } from "@lakeze/shared/components/skeletons/DetailSkeleton";
import { FrontendSkeleton } from "@lakeze/shared/components/skeletons/FrontendSkeleton";
import { PageTransition } from "@lakeze/shared/components/PageTransition";
import NativeShell from "@lakeze/shared/components/native/NativeShell";
import { ChunkErrorBoundary } from "@lakeze/shared/components/ChunkErrorBoundary";
import { BookingDomainRedirect } from "@lakeze/shared/components/BookingDomainRedirect";
import { AliasResolver } from "@lakeze/shared/components/AliasResolver";
import { PmsDomainGuard } from "@lakeze/shared/components/PmsDomainGuard";
import { RequireModule } from "@/components/RequireModule";
import { useVersionCheck } from "@lakeze/shared/hooks/useVersionCheck";
import { usePushBootstrap } from "@lakeze/shared/hooks/use-push-bootstrap";
const { Suspense, lazy } = React;
import Auth from "@/pages/Auth";
import TeamAuth from "@/pages/TeamAuth";
const PmsLogin = lazy(() => import("@/pages/PmsLogin"));
const NotFound = lazy(() => import("@lakeze/shared/pages/NotFound"));
const ChangePassword = lazy(() => import("@lakeze/shared/pages/ChangePassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const WebsiteContent = lazy(() => import("@/pages/WebsiteContent"));
const GoogleBusinessProfileApiHelp = lazy(() => import("@/pages/help/GoogleBusinessProfileApiHelp"));
const Faq = lazy(() => import("@/pages/Faq"));
const Orders = lazy(() => import("@/pages/Orders"));
const OrderDetail = lazy(() => import("@/pages/OrderDetail"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const AdminPackages = lazy(() => import("@/pages/AdminPackages"));
const AdminPackagesPreview = lazy(() => import("@/pages/AdminPackagesPreview"));
const AdminSearchCard = lazy(() => import("@/pages/AdminSearchCard"));
const RoomInventory = lazy(() => import("@/pages/RoomInventory"));
const ManualReviewTasks = lazy(() => import("@/pages/ManualReviewTasks"));
const AdminGroupBuy = lazy(() => import("@/pages/AdminGroupBuy"));
const KolReciprocalQuota = lazy(() => import("@/pages/admin/KolReciprocalQuota"));
const AdminAiFaq = lazy(() => import("@/pages/admin/ai-faq/AdminAiFaq"));
const RoomPriceCalendar = lazy(() => import("@/pages/RoomPriceCalendar"));
const PackagePriceCalendar = lazy(() => import("@/pages/PackagePriceCalendar"));
const Accounts = lazy(() => import("@/pages/Accounts"));
const Onboarding = lazy(() => import("@/pages/admin/Onboarding"));
const PermissionTemplates = lazy(() => import("@/pages/PermissionTemplates"));
const KolDiscount = lazy(() => import("@/pages/KolDiscount"));
const DiscountCodeOrders = lazy(() => import("@/pages/DiscountCodeOrders"));
const KolDiscountDetail = lazy(() => import("@/pages/KolDiscountDetail"));
const TeamLayout = lazy(() => import("@/components/team/TeamLayout"));
const TeamHome = lazy(() => import("@/pages/team/TeamHome"));
const TeamOrders = lazy(() => import("@/pages/team/TeamOrders"));
const TeamMembers = lazy(() => import("@/pages/team/TeamMembers"));
const TeamKOL = lazy(() => import("@/pages/team/TeamKOL"));
const TeamKolVenueConfirm = lazy(() => import("@/pages/team/TeamKolVenueConfirm"));
const TeamCommission = lazy(() => import("@/pages/team/TeamCommission"));
const KolBonus = lazy(() => import("@/pages/team/KolBonus"));
const KolBonusPublic = lazy(() => import("@/pages/team/KolBonusPublic"));
const TeamNotification = lazy(() => import("@/pages/team/TeamNotification"));
const TeamFranchise = lazy(() => import("@/pages/team/TeamFranchise"));
const TeamStarlink = lazy(() => import("@/pages/team/TeamStarlink"));
const TeamLineOA = lazy(() => import("@/pages/team/TeamLineOA"));
const Customers = lazy(() => import("@/pages/Customers"));
const CustomerOrders = lazy(() => import("@/pages/CustomerOrders"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const DataBackup = lazy(() => import("@/pages/DataBackup"));
const EmailTest = lazy(() => import("@/pages/EmailTest"));
const EmailPreview = lazy(() => import("@/pages/EmailPreview"));
const Settlement = lazy(() => import("@/pages/Settlement"));
const OwnerSettlement = lazy(() => import("@/pages/OwnerSettlement"));
const OwnerSettlementSettings = lazy(() => import("@lakeze/shared/pages/OwnerSettlementSettings"));
const PaymentAudit = lazy(() => import("@/pages/PaymentAudit"));
const AddonCenter = lazy(() => import("@/pages/AddonCenter"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Reception = lazy(() => import("@/pages/Reception"));
const ChannelManager = lazy(() => import("@/pages/ChannelManager"));
const OwlTingEmailIngest = lazy(() => import("@/pages/OwlTingEmailIngest"));
import { CrossSiteRedirect } from "./CrossSiteRedirect";

function App() {
  useVersionCheck();
  usePushBootstrap();
  return (
    <BrowserRouter>
      <AccommodationProvider>
        <BookingDomainRedirect>
        <PmsDomainGuard>
        <CrossSiteRedirect>
          <PageTransition>
            <NativeShell>
            <ChunkErrorBoundary>
              {(() => {
                // 共用子路由：可掛在根層或 /:alias/* 之下
                const sharedRoutes = (
                  <>
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
                    <Route path="admin/onboarding" element={
                      <RequireModule module="onboarding">
                        <Suspense fallback={<FormSkeleton fields={8} />}><Onboarding /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin" element={
                      <RequireModule module="analytics">
                        <Suspense fallback={<DashboardSkeleton />}><Dashboard /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="help/google-business-profile-api" element={
                      <RequireModule module="website_content">
                        <Suspense fallback={<FormSkeleton fields={6} />}><GoogleBusinessProfileApiHelp /></Suspense>
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
                    {/* 以下 AI 管家相關頁面已搬遷至總部後台 hq.lakeze.com */}
                    <Route path="admin/line-butler" element={
                      <MovedToHQCard hqPath="/hq/line-butler" title="LINE AI 管家監看已移至總部後台" />
                    } />
                    <Route path="admin/traveler-attributes" element={
                      <MovedToHQCard hqPath="/hq/traveler-attributes" title="旅遊屬性已移至總部後台" />
                    } />
                    <Route path="admin/deploy-status" element={
                      <MovedToHQCard hqPath="/hq/deploy-status" title="部署佐證已移至總部後台" />
                    } />
                    <Route path="admin/knowledge/index" element={
                      <MovedToHQCard hqPath="/hq/knowledge/index" title="知識庫索引已移至總部後台" />
                    } />
                    <Route path="admin/knowledge/search" element={
                      <MovedToHQCard hqPath="/hq/knowledge/search" title="知識庫檢索已移至總部後台" />
                    } />
                    <Route path="admin/reply-templates" element={
                      <MovedToHQCard hqPath="/hq/ai-training/reply-templates" title="回覆樣板已移至總部後台" />
                    } />
                    <Route path="admin/model-training" element={
                      <MovedToHQCard hqPath="/hq/ai-training/model-training" title="模型訓練已移至總部後台" />
                    } />



                    <Route path="admin/manual-review" element={
                      <RequireModule module="orders">
                        <Suspense fallback={<TableSkeleton rows={8} columns={8} />}><ManualReviewTasks /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/group-buy" element={
                      <RequireModule module="group_buy">
                        <Suspense fallback={<TableSkeleton rows={8} columns={7} />}><AdminGroupBuy /></Suspense>
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
                    <Route path="admin/ai-faq" element={
                      <RequireModule module="ai_faq">
                        <Suspense fallback={<TableSkeleton rows={6} columns={5} />}><AdminAiFaq /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/room-price-calendar" element={
                      <RequireModule module="room_price">
                        <Suspense fallback={<TableSkeleton rows={8} columns={15} />}><RoomPriceCalendar /></Suspense>
                      </RequireModule>
                    } />
                    <Route path="admin/package-price-calendar" element={
                      <RequireModule module="room_price">
                        <Suspense fallback={<TableSkeleton rows={8} columns={15} />}><PackagePriceCalendar /></Suspense>
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
                    <Route path="admin/kol-overview" element={
                      <MovedToHQCard hqPath="/hq/kol-overview" title="創作者總覽已移至總部後台" description="創作者與裂變推廣由總部統一管理，跨館創作者績效已集中到總部後台。" />
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
                    {/* 孤兒路由：側邊欄已無入口，統一轉址到帳號管理 */}
                    <Route path="admin/user-roles" element={<Navigate to="/admin/accounts" replace />} />
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
                    {/* 以下平台層級模組已搬遷至總部後台 hq.lakeze.com */}
                    <Route path="admin/cdp" element={
                      <MovedToHQCard hqPath="/hq/cdp" title="旅客資料匯流已移至總部後台" description="顧客資料與行銷推廣由總部統一管理，全平台旅客檔案已集中到總部後台。" />
                    } />
                    <Route path="admin/cdp/:travelerId" element={
                      <MovedToHQCard hqPath="/hq/cdp" title="旅客資料匯流已移至總部後台" description="顧客資料與行銷推廣由總部統一管理，全平台旅客檔案已集中到總部後台。" />
                    } />
                    <Route path="admin/remarketing" element={
                      <MovedToHQCard hqPath="/hq/remarketing" title="AI 再行銷推播已移至總部後台" description="顧客資料與行銷推廣由總部統一管理，再行銷活動已集中到總部後台。" />
                    } />
                    <Route path="admin/referral" element={
                      <MovedToHQCard hqPath="/hq/referral" title="社群裂變推廣已移至總部後台" description="創作者與裂變推廣由總部統一管理，活動設定已集中到總部後台。" />
                    } />

                    <Route path="admin/notifications" element={
                      <RequireModule module="orders">
                        <Suspense fallback={<TableSkeleton rows={8} columns={4} showFilters={false} />}><Notifications /></Suspense>
                      </RequireModule>
                    } />
                    {/* 孤兒路由：側邊欄入口為 /admin/holidays，統一轉址 */}
                    <Route path="admin/public-holidays" element={<Navigate to="/admin/holidays" replace />} />
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
                    <Route path="admin/payment-audit" element={
                      <RequireModule module="payment_audit">
                        <Suspense fallback={<TableSkeleton rows={8} columns={8} />}><PaymentAudit /></Suspense>
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
                    {/* AI 管家訓練中心已搬遷至總部後台 hq.lakeze.com */}
                    <Route path="admin/ai-training/*" element={<MovedToHQCard />} />
                  </>
                );

                return (
                  <Routes>
                    <Route element={<ConditionalLayout />}>
                      {/* 根層路由（向下相容） */}
                      {sharedRoutes}

                      {/* PMS 民宿後台登入頁（pms.lakeze.com） */}
                      <Route path="/login" element={
                        <Suspense fallback={null}><PmsLogin /></Suspense>
                      } />
                      <Route path="/team-auth" element={<TeamAuth />} />
                      <Route path="/team/kol/bonus/:token" element={
                        <Suspense fallback={null}><KolBonusPublic /></Suspense>
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
                        {/* 廣告追蹤頁暫時對所有人隱藏（頁面保留，之後恢復再取消註解） */}
                        <Route path="ads" element={<Navigate to="/team" replace />} />
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

                      {/* /:alias/* — pms.lakeze.com/{alias}/admin 等使用 */}
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
            </NativeShell>
          </PageTransition>
        </CrossSiteRedirect>
        </PmsDomainGuard>
        </BookingDomainRedirect>
      </AccommodationProvider>
    </BrowserRouter>
  );
}

export default App;
