import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTeam } from "@lakeze/shared/components/team/TeamContext";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Tabs, TabsContent } from "@lakeze/shared/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { canWriteGap, type GapKey } from "@lakeze/shared/lib/settingsGapLinks";
import { useTeamOnboarding } from "@/hooks/use-team-onboarding";
import { useVenueGaps } from "@/hooks/use-venue-gaps";
import { OnboardingRoleGuide } from "@/components/team/onboarding/OnboardingRoleGuide";
import { AmSection } from "@/components/team/onboarding/AmSection";
import { KolSection } from "@/components/team/onboarding/KolSection";
import { GapsSection, PayuniSection } from "@/components/team/onboarding/GapsSection";
import { BonusVenueSection } from "@/components/team/onboarding/BonusVenueSection";
import { BonusRulesSection } from "@/components/team/onboarding/BonusRulesSection";
import { OnbTabsList } from "@/components/team/onboarding/OnbTabsList";
import { STAGE_LABEL, canAssignAm, canSetItem, canViewOnboarding, venueStage, type OnbItem } from "@/lib/teamOnboarding";
import { ONB_TABS, defaultTab, gapInTab, itemInTab, tabPending, visibleTabs, type OnbTabKey } from "@/lib/onboardingTabs";

export default function TeamOnboardingVenue() {
  const { accId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const { roles } = useTeam();
  const { rows, members, loading, error, reload } = useTeamOnboarding();
  const { gapsByAcc } = useVenueGaps();
  const row = rows.find((r) => r.accommodation_id === accId);
  const isSuperAdmin = roles.includes("super_admin");

  if (!canViewOnboarding(roles)) {
    return <p className="p-6 text-sm text-muted-foreground" data-testid="onboarding-no-access">你沒有檢視館別設定總覽的權限。</p>;
  }

  const tabs = visibleTabs(roles);
  const wanted = params.get("tab") as OnbTabKey | null;
  const active = wanted && tabs.includes(wanted) ? wanted : defaultTab(roles);
  const gaps = row ? gapsByAcc.get(row.accommodation_id) ?? [] : [];
  const mineBonus = canSetItem("bonusFlags", roles);
  const mineAm = canAssignAm(roles);

  const sections: Array<{ items: OnbItem[]; node: () => JSX.Element }> = row
    ? [
        { items: ["am", "access"], node: () => <AmSection key="am" row={row} members={members} canEdit={mineAm} isSuperAdmin={isSuperAdmin} onChanged={reload} /> },
        { items: ["kolVenue", "quota"], node: () => <KolSection key="kol" row={row} roles={roles} onChanged={reload} /> },
        { items: ["payuni"], node: () => <PayuniSection key="payuni" row={row} isSuperAdmin={isSuperAdmin} /> },
        { items: ["bonusRules"], node: () => <BonusRulesSection key="rules" accId={row.accommodation_id} roles={roles} /> },
        { items: ["bonusFlags"], node: () => <BonusVenueSection key="bonus" accId={row.accommodation_id} accName={row.accommodation_name} canEdit={mineBonus} /> },
      ]
    : [];
  const counts = row ? Object.fromEntries(tabs.map((k) => [k, tabPending(row, gaps.map((g) => g.key), k)])) : {};

  return (
    <div className="space-y-6" data-testid="onboarding-venue-page">
      <Link to={`/team/onboarding`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="onboarding-back-link">
        <ArrowLeft className="h-4 w-4" />回館別設定總覽
      </Link>
      {error && <p className="text-sm text-destructive" data-testid="onboarding-error">{error}</p>}
      {!row ? (
        !loading && <p className="text-sm text-muted-foreground" data-testid="onboarding-venue-not-found">找不到這個館別。</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold" data-testid="onboarding-venue-name">{row.accommodation_name}</h1>
            <Badge variant="outline" className="font-normal" data-testid="onboarding-venue-stage">{STAGE_LABEL[venueStage(row)]}</Badge>
          </div>
          <OnboardingRoleGuide />
          <Tabs value={active} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
            <OnbTabsList tabs={tabs} counts={counts} prefix="onboarding-venue" unit=" 項" />
            {tabs.map((k) => {
              const tabSections = sections.filter((s) => s.items.some((i) => itemInTab(k, i)));
              const tabGaps = gaps.filter((g) => gapInTab(k, g.key as GapKey));
              const gapsMine = tabGaps.every((g) => canWriteGap(g.key as GapKey, roles));
              return (
                <TabsContent key={k} value={k} className="mt-4 space-y-4" data-testid={`onboarding-venue-tabpanel-${k}`}>
                  <p className="text-sm text-muted-foreground">{ONB_TABS[k].hint}</p>
                  {tabSections.map((s) => s.node())}
                  {tabGaps.length > 0 && <GapsSection gaps={tabGaps} roles={roles} accId={row.accommodation_id} mine={gapsMine} />}
                  {tabSections.length === 0 && tabGaps.length === 0 && (
                    <p className="text-sm text-muted-foreground" data-testid={`onboarding-tab-empty-${k}`}>這個 Tab 沒有需要設定的項目。</p>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        </>
      )}
    </div>
  );
}
