import * as React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ConditionalLayout } from "@lakeze/shared/components/ConditionalLayout";
import { RequireHQRole } from "@/components/hq/RequireHQRole";
import { HQIndexGate } from "@/components/hq/HQIndexGate";
import { HQ_AI_ROLES } from "@/lib/hqAccess";
import { AccommodationProvider } from "@lakeze/shared/contexts/AccommodationContext";
import { DashboardSkeleton } from "@lakeze/shared/components/skeletons/DashboardSkeleton";
import { TableSkeleton } from "@lakeze/shared/components/skeletons/TableSkeleton";
import { FormSkeleton } from "@lakeze/shared/components/skeletons/FormSkeleton";
import { FrontendSkeleton } from "@lakeze/shared/components/skeletons/FrontendSkeleton";
import { PageTransition } from "@lakeze/shared/components/PageTransition";
import NativeShell from "@lakeze/shared/components/native/NativeShell";
import { ChunkErrorBoundary } from "@lakeze/shared/components/ChunkErrorBoundary";
import { HQDomainRedirect } from "@lakeze/shared/components/HQDomainRedirect";
import { useVersionCheck } from "@lakeze/shared/hooks/useVersionCheck";
import { usePushBootstrap } from "@lakeze/shared/hooks/use-push-bootstrap";
const { Suspense, lazy } = React;
import HQAuth from "@/pages/HQAuth";
const ReferralAdmin = lazy(() => import("@/pages/ReferralAdmin"));
const NotFound = lazy(() => import("@lakeze/shared/pages/NotFound"));
const ChangePassword = lazy(() => import("@lakeze/shared/pages/ChangePassword"));
const TravelerAttributes = lazy(() => import("@/pages/admin/TravelerAttributes"));
const DeployStatus = lazy(() => import("@/pages/admin/DeployStatus"));
const LineButler = lazy(() => import("@/pages/admin/LineButler"));
const AdminKolOverview = lazy(() => import("@/pages/AdminKolOverview"));
const Headquarters = lazy(() => import("@/pages/Headquarters"));
const TravelerCdp = lazy(() => import("@/pages/TravelerCdp"));
const RemarketingAdmin = lazy(() => import("@/pages/admin/RemarketingAdmin"));
const TravelerProfileDetail = lazy(() => import("@/pages/TravelerProfileDetail"));
const HQOwnerSettlementSettings = lazy(() => import("@/pages/hq/HQOwnerSettlementSettings"));
const HQBonusSettings = lazy(() => import("@/pages/hq/HQBonusSettings"));
const HQBrandPartners = lazy(() => import("@/pages/hq/HQBrandPartners"));
const HQGoogleBusinessProfileRetired = lazy(() => import("@/pages/hq/HQGoogleBusinessProfileRetired"));
const HQ_SETTINGS_ROLES = ["super_admin", "admin", "finance", "am", "am_manager", "hotel_admin"];
const AiTrainingLayout = lazy(() => import("@/pages/ai-training/AiTrainingLayout"));
const AiTrainingDashboard = lazy(() => import("@/pages/ai-training/AiTrainingDashboard"));
const AiTrainingPrompt = lazy(() => import("@/pages/ai-training/AiTrainingPrompt"));
const AiTrainingKnowledge = lazy(() => import("@/pages/ai-training/AiTrainingKnowledge"));
const AiTrainingExamples = lazy(() => import("@/pages/ai-training/AiTrainingExamples"));
const AiTrainingConversations = lazy(() => import("@/pages/ai-training/AiTrainingConversations"));
const AiTrainingPlayground = lazy(() => import("@/pages/ai-training/AiTrainingPlayground"));
const AiTrainingVersions = lazy(() => import("@/pages/ai-training/AiTrainingVersions"));
const AiTrainingApiKeys = lazy(() => import("@/pages/ai-training/AiTrainingApiKeys"));
const AdminAiTrainingApiDocs = lazy(() => import("@/pages/admin/ai-training/AdminAiTrainingApiDocs"));
const KnowledgeIndexPage = lazy(() => import("@/pages/admin/knowledge/KnowledgeIndex"));
const AdminAiReplyTemplatesPage = lazy(() => import("@/pages/admin/ai-training/AdminAiReplyTemplates"));
const AdminAiModelTrainingPage = lazy(() => import("@/pages/admin/ai-training/AdminAiModelTraining"));
const KnowledgeSearchPage = lazy(() => import("@/pages/admin/knowledge/KnowledgeSearch"));
import { CrossSiteRedirect } from "./CrossSiteRedirect";

function App() {
  useVersionCheck();
  usePushBootstrap();
  return (
    <BrowserRouter>
      <AccommodationProvider>
        <HQDomainRedirect>
        <CrossSiteRedirect>
          <PageTransition>
            <NativeShell>
            <ChunkErrorBoundary>
              <Routes>
                <Route element={<ConditionalLayout />}>
                {/* HQ 與 headquarters 路由（不放入 alias 樹下） */}
                <Route path="/hq-auth" element={<HQAuth />} />
                <Route path="/hq/ai-training" element={
                  <RequireHQRole allow={HQ_AI_ROLES}>
                    <Suspense fallback={<DashboardSkeleton />}><AiTrainingLayout /></Suspense>
                  </RequireHQRole>
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
                  <Route path="reply-templates" element={
                    <Suspense fallback={null}><AdminAiReplyTemplatesPage /></Suspense>
                  } />
                  <Route path="model-training" element={
                    <Suspense fallback={null}><AdminAiModelTrainingPage /></Suspense>
                  } />
                  <Route path="api-keys" element={
                    <Suspense fallback={null}><AiTrainingApiKeys /></Suspense>
                  } />
                  <Route path="api-docs" element={
                    <Suspense fallback={null}><AdminAiTrainingApiDocs /></Suspense>
                  } />
                </Route>

                {/* AI 管家／行程引擎（總部全平台視角） */}
                <Route path="/hq/line-butler" element={
                  <Suspense fallback={<TableSkeleton rows={8} columns={4} />}><LineButler /></Suspense>
                } />
                <Route path="/hq/knowledge/index" element={
                  <RequireHQRole allow={HQ_AI_ROLES}>
                    <Suspense fallback={<DashboardSkeleton />}><KnowledgeIndexPage /></Suspense>
                  </RequireHQRole>
                } />
                <Route path="/hq/knowledge/search" element={
                  <RequireHQRole allow={HQ_AI_ROLES}>
                    <Suspense fallback={<DashboardSkeleton />}><KnowledgeSearchPage /></Suspense>
                  </RequireHQRole>
                } />
                <Route path="/hq/traveler-attributes" element={
                  <Suspense fallback={<TableSkeleton rows={8} columns={9} />}><TravelerAttributes /></Suspense>
                } />
                <Route path="/hq/deploy-status" element={
                  <Suspense fallback={<FrontendSkeleton />}><DeployStatus /></Suspense>
                } />

                {/* 顧客與行銷／創作者與裂變（總部全平台視角） */}
                <Route path="/hq/cdp" element={
                  <Suspense fallback={<TableSkeleton rows={10} columns={6} />}><TravelerCdp /></Suspense>
                } />
                <Route path="/hq/cdp/:travelerId" element={
                  <Suspense fallback={<TableSkeleton rows={8} columns={5} />}><TravelerProfileDetail /></Suspense>
                } />
                <Route path="/hq/remarketing" element={
                  <Suspense fallback={<TableSkeleton rows={8} columns={6} />}><RemarketingAdmin /></Suspense>
                } />
                <Route path="/hq/kol-overview" element={
                  <Suspense fallback={<TableSkeleton rows={8} columns={7} />}><AdminKolOverview /></Suspense>
                } />
                <Route path="/hq/referral" element={
                  <Suspense fallback={<TableSkeleton rows={8} columns={5} />}><ReferralAdmin /></Suspense>
                } />

                <Route path="/hq/owner-settlement-settings" element={
                  <RequireHQRole allow={HQ_SETTINGS_ROLES}>
                    <Suspense fallback={<FormSkeleton fields={3} />}><HQOwnerSettlementSettings /></Suspense>
                  </RequireHQRole>
                } />
                <Route path="/hq/bonus-settings" element={
                  <RequireHQRole allow={HQ_SETTINGS_ROLES}>
                    <Suspense fallback={<FormSkeleton fields={3} />}><HQBonusSettings /></Suspense>
                  </RequireHQRole>
                } />
                {/* 已退休：Google 商家串接改為各館自主管理，僅保留停用說明頁 */}
                <Route path="/hq/integrations/google-business-profile" element={
                  <RequireHQRole allow={["super_admin"]}>
                    <Suspense fallback={<FormSkeleton fields={2} />}><HQGoogleBusinessProfileRetired /></Suspense>
                  </RequireHQRole>
                } />

                <Route path="/hq/brand-partners" element={
                  <RequireHQRole allow={["super_admin"]}>
                    <Suspense fallback={<FormSkeleton fields={3} />}><HQBrandPartners /></Suspense>
                  </RequireHQRole>
                } />

                <Route path="/hq" element={
                  <HQIndexGate>
                    <Suspense fallback={<DashboardSkeleton />}><Headquarters /></Suspense>
                  </HQIndexGate>
                } />
                <Route path="/headquarters/change-password" element={
                  <Suspense fallback={<FrontendSkeleton />}><ChangePassword /></Suspense>
                } />

                  <Route path="*" element={
                    <Suspense fallback={<FrontendSkeleton />}><NotFound /></Suspense>
                  } />
                </Route>
              </Routes>
            </ChunkErrorBoundary>
            </NativeShell>
          </PageTransition>
        </CrossSiteRedirect>
        </HQDomainRedirect>
      </AccommodationProvider>
    </BrowserRouter>
  );
}

export default App;
