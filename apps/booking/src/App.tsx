import * as React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ConditionalLayout } from "@lakeze/shared/components/ConditionalLayout";
import { AccommodationProvider } from "@lakeze/shared/contexts/AccommodationContext";
import { FrontendSkeleton } from "@lakeze/shared/components/skeletons/FrontendSkeleton";
import { PageTransition } from "@lakeze/shared/components/PageTransition";
import NativeShell from "@lakeze/shared/components/native/NativeShell";
import { ChunkErrorBoundary } from "@lakeze/shared/components/ChunkErrorBoundary";
import { BookingDomainRedirect } from "@lakeze/shared/components/BookingDomainRedirect";
import { AliasResolver } from "@lakeze/shared/components/AliasResolver";
import { PmsDomainGuard } from "@lakeze/shared/components/PmsDomainGuard";
import { useVersionCheck } from "@lakeze/shared/hooks/useVersionCheck";
import { usePushBootstrap } from "@lakeze/shared/hooks/use-push-bootstrap";
const { Suspense, lazy } = React;
import Index from "@/pages/Index";
const OAuthConsent = lazy(() => import("@/pages/OAuthConsent"));
const BookingPortal = lazy(() => import("@/pages/BookingPortal"));
const BookingSearchResults = lazy(() => import("@/pages/BookingSearchResults"));
const LegacyBookingRedirect = lazy(() => import("@/components/LegacyBookingRedirect"));
const BookingVilla = lazy(() => import("@lakeze/shared/pages/BookingVilla"));
const AliasVillaEntry = lazy(() => import("@/components/AliasVillaEntry"));
const MemberAuth = lazy(() => import("@/pages/MemberAuth"));
const MemberLayout = lazy(() => import("@/components/member/MemberLayout"));
const MemberProfile = lazy(() => import("@/pages/MemberProfile"));
const MemberProfileEdit = lazy(() => import("@/pages/MemberProfileEdit"));
const MemberPoints = lazy(() => import("@/pages/MemberPoints"));
const MemberCoupons = lazy(() => import("@/pages/MemberCoupons"));
const MemberOrders = lazy(() => import("@/pages/MemberOrders"));
const MemberOrderDetail = lazy(() => import("@/pages/MemberOrderDetail"));
const MemberMessages = lazy(() => import("@/pages/MemberMessages"));
const MemberRecentViews = lazy(() => import("@/pages/MemberRecentViews"));
const MemberCards = lazy(() => import("@/pages/MemberCards"));
const MemberCommonInfo = lazy(() => import("@/pages/MemberCommonInfo"));
const MemberFavorites = lazy(() => import("@/pages/MemberFavorites"));
const MemberReferral = lazy(() => import("@/pages/MemberReferral"));
const ReferralLanding = lazy(() => import("@/pages/ReferralLanding"));
const MemberResetPassword = lazy(() => import("@/pages/MemberResetPassword"));
const MemberLineCallback = lazy(() => import("@/pages/MemberLineCallback"));
const MemberFacebookCallback = lazy(() => import("@/pages/MemberFacebookCallback"));
const BookingFlow = lazy(() => import("@/pages/BookingFlow"));
const LinePayConfirm = lazy(() => import("@/pages/LinePayConfirm"));
const AIBooking = lazy(() => import("@/pages/AIBooking"));
const OrderSearch = lazy(() => import("@/pages/OrderSearch"));
const Profile = lazy(() => import("@/pages/Profile"));
const PaymentTest = lazy(() => import("@/pages/PaymentTest"));
const PublicPayment = lazy(() => import("@/pages/PublicPayment"));
const OrderPayment = lazy(() => import("@/pages/OrderPayment"));
const AtmBookingSuccess = lazy(() => import("@/pages/AtmBookingSuccess"));
const PaymentResult = lazy(() => import("@/pages/PaymentResult"));
const PaymentStatus = lazy(() => import("@/pages/PaymentStatus"));
const PaymentReceipt = lazy(() => import("@/pages/PaymentReceipt"));
const NotFound = lazy(() => import("@lakeze/shared/pages/NotFound"));
const OgImagePreview = lazy(() => import("@/pages/OgImagePreview"));
const KolApiDocs = lazy(() => import("@/pages/KolApiDocs"));
const PointsApiDocs = lazy(() => import("@/pages/PointsApiDocs"));
const AccommodationApiDocs = lazy(() => import("@/pages/AccommodationApiDocs"));
const AccommodationAiApiDocs = lazy(() => import("@/pages/AccommodationAiApiDocs"));
const OwlTingCmDocs = lazy(() => import("@/pages/OwlTingCmDocs"));
const ApiDocsHub = lazy(() => import("@/pages/ApiDocsHub"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const LegalDocument = lazy(() => import("@/pages/LegalDocument"));
const Trips = lazy(() => import("@/pages/Trips"));
const TripGuide = lazy(() => import("@/pages/TripGuide"));
const TripTemplates = lazy(() => import("@/pages/TripTemplates"));
const TripGenerate = lazy(() => import("@/pages/TripGenerate"));
const TripDetail = lazy(() => import("@/pages/TripDetail"));
const TripEdit = lazy(() => import("@/pages/TripEdit"));
const TripShare = lazy(() => import("@/pages/TripShare"));
const Cart = lazy(() => import("@/pages/Cart"));
const LiffCheckout = lazy(() => import("@/pages/liff/LiffCheckout"));
const LiffFavorites = lazy(() => import("@/pages/liff/LiffFavorites"));
const DataDeletion = lazy(() => import("@/pages/DataDeletion"));
const GroupBuyCampaign = lazy(() => import("@/pages/GroupBuyCampaign"));
const GroupBuyOrderLookup = lazy(() => import("@/pages/GroupBuyOrderLookup"));
const GroupBuyOrderConfirmation = lazy(() => import("@/pages/GroupBuyOrderConfirmation"));
const KolDashboardPublic = lazy(() => import("@/pages/kol/KolDashboardPublic"));
const KolReferralJoin = lazy(() => import("@/pages/kol/KolReferralJoin"));
const SaaSWorkspace = lazy(() => import("@/pages/SaaSWorkspace"));
const OwlTingFillup = lazy(() => import("@/pages/OwlTingFillup"));
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
                    <Route path="booking/:accId" element={
                      <Suspense fallback={<FrontendSkeleton />}><LegacyBookingRedirect /></Suspense>
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
                      <Route path="profile/edit" element={
                        <Suspense fallback={<FrontendSkeleton />}><MemberProfileEdit /></Suspense>
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
                      <Route path="orders/:orderNumber" element={
                        <Suspense fallback={<FrontendSkeleton />}><MemberOrderDetail /></Suspense>
                      } />
                      <Route path="messages" element={
                        <Suspense fallback={<FrontendSkeleton />}><MemberMessages /></Suspense>
                      } />
                      <Route path="recent-views" element={
                        <Suspense fallback={<FrontendSkeleton />}><MemberRecentViews /></Suspense>
                      } />
                      <Route path="cards" element={
                        <Suspense fallback={<FrontendSkeleton />}><MemberCards /></Suspense>
                      } />
                      <Route path="common-info" element={
                        <Suspense fallback={<FrontendSkeleton />}><MemberCommonInfo /></Suspense>
                      } />
                      <Route path="favorites" element={
                        <Suspense fallback={<FrontendSkeleton />}><MemberFavorites /></Suspense>
                      } />
                      <Route path="referral" element={
                        <Suspense fallback={<FrontendSkeleton />}><MemberReferral /></Suspense>
                      } />
                    </Route>
                    <Route path="r/:inviteCode" element={
                      <Suspense fallback={<FrontendSkeleton />}><ReferralLanding /></Suspense>
                    } />
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
                    <Route path="payment-result" element={
                      <Suspense fallback={<FrontendSkeleton />}><PaymentResult /></Suspense>
                    } />
                    <Route path="payment-status" element={
                      <Suspense fallback={<FrontendSkeleton />}><PaymentStatus /></Suspense>
                    } />
                    <Route path="payment-receipt" element={
                      <Suspense fallback={<FrontendSkeleton />}><PaymentReceipt /></Suspense>
                    } />


                    <Route path="privacy" element={
                      <Suspense fallback={<FrontendSkeleton />}><Privacy /></Suspense>
                    } />
                    <Route path="data-deletion" element={
                      <Suspense fallback={<FrontendSkeleton />}><DataDeletion /></Suspense>
                    } />
                    <Route path="trips" element={
                      <Suspense fallback={<FrontendSkeleton />}><Trips /></Suspense>
                    } />
                    <Route path="trips/guide" element={
                      <Suspense fallback={<FrontendSkeleton />}><TripGuide /></Suspense>
                    } />
                    <Route path="trips/templates" element={
                      <Suspense fallback={<FrontendSkeleton />}><TripTemplates /></Suspense>
                    } />
                    <Route path="trips/generate" element={
                      <Suspense fallback={<FrontendSkeleton />}><TripGenerate /></Suspense>
                    } />



                    <Route path="trips/:tripId" element={
                      <Suspense fallback={<FrontendSkeleton />}><TripDetail /></Suspense>
                    } />
                    <Route path="trips/:tripId/edit" element={
                      <Suspense fallback={<FrontendSkeleton />}><TripEdit /></Suspense>
                    } />
                    <Route path="trips/:slug/share" element={
                      <Suspense fallback={<FrontendSkeleton />}><TripShare /></Suspense>
                    } />

                    <Route path="cart" element={
                      <Suspense fallback={<FrontendSkeleton />}><Cart /></Suspense>
                    } />
                    <Route path="liff/checkout" element={
                      <Suspense fallback={<FrontendSkeleton />}><LiffCheckout /></Suspense>
                    } />
                    <Route path="liff/favorites" element={
                      <Suspense fallback={<FrontendSkeleton />}><LiffFavorites /></Suspense>
                    } />
                    <Route path="legal/:slug" element={
                      <Suspense fallback={<FrontendSkeleton />}><LegalDocument /></Suspense>
                    } />

                    {/* 網紅團購 */}
                    <Route path="g/order" element={
                      <Suspense fallback={<FrontendSkeleton />}><GroupBuyOrderLookup /></Suspense>
                    } />
                    <Route path="g/order/:orderNumber/confirmed" element={
                      <Suspense fallback={<FrontendSkeleton />}><GroupBuyOrderConfirmation /></Suspense>
                    } />
                    <Route path="g/order/:orderNumber" element={
                      <Suspense fallback={<FrontendSkeleton />}><GroupBuyOrderLookup /></Suspense>
                    } />
                    <Route path="g/:slug" element={
                      <Suspense fallback={<FrontendSkeleton />}><GroupBuyCampaign /></Suspense>
                    } />





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

                      {/* MCP / Agent 整合的 OAuth 同意頁 */}
                      <Route path="/.lovable/oauth/consent" element={
                        <Suspense fallback={null}><OAuthConsent /></Suspense>
                      } />
                      {/* 成長營運工作台（需登入，守衛在頁面內自行處理） */}
                      <Route path="/SaaS" element={
                        <Suspense fallback={null}><SaaSWorkspace /></Suspense>
                      } />
                      <Route path="/saas" element={
                        <Suspense fallback={null}><SaaSWorkspace /></Suspense>
                      } />
                      <Route path="/kol/d/:token" element={
                        <Suspense fallback={null}><KolDashboardPublic /></Suspense>
                      } />
                      <Route path="/kol/join/:code" element={
                        <Suspense fallback={null}><KolReferralJoin /></Suspense>
                      } />
                      {/* /:alias/* — booking.lakeze.com/{alias}/admin 等使用 */}
                      <Route path="/:alias" element={<AliasResolver />}>
                        <Route index element={
                          <Suspense fallback={<FrontendSkeleton />}><AliasVillaEntry /></Suspense>
                        } />
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
