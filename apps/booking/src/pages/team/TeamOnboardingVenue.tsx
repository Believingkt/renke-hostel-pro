import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useTeam } from "@lakeze/shared/components/team/TeamContext";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { canWriteGap, type GapKey } from "@lakeze/shared/lib/settingsGapLinks";
import { useTeamOnboarding } from "@/hooks/use-team-onboarding";
import { useVenueGaps } from "@/hooks/use-venue-gaps";
import { OnboardingRoleGuide } from "@/components/team/onboarding/OnboardingRoleGuide";
import { AmSection } from "@/components/team/onboarding/AmSection";
import { KolSection } from "@/components/team/onboarding/KolSection";
import { GapsSection, PayuniSection } from "@/components/team/onboarding/GapsSection";
import { BonusVenueSection } from "@/components/team/onboarding/BonusVenueSection";
import { STAGE_LABEL, canAssignAm, canSetItem, canViewOnboarding, venueStage } from "@/lib/teamOnboarding";

function Block({ title, hint, testId, children }: { title: string; hint: string; testId: string; children: ReactNode }) {
  return (
    <section className="space-y-3" data-testid={testId}>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}

export default function TeamOnboardingVenue() {
  const { accId = "" } = useParams();
  const { roles } = useTeam();
  const { rows, members, loading, error, reload } = useTeamOnboarding();
  const { gapsByAcc } = useVenueGaps();
  const row = rows.find((r) => r.accommodation_id === accId);
  const isSuperAdmin = roles.includes("super_admin");

  if (!canViewOnboarding(roles)) {
    return <p className="p-6 text-sm text-muted-foreground" data-testid="onboarding-no-access">你沒有檢視館別設定總覽的權限。</p>;
  }

  const gaps = row ? gapsByAcc.get(row.accommodation_id) ?? [] : [];
  const myGaps = gaps.filter((g) => canWriteGap(g.key as GapKey, roles));
  const otherGaps = gaps.filter((g) => !canWriteGap(g.key as GapKey, roles));
  const mineAm = canAssignAm(roles);
  const mineKol = canSetItem("kolVenue", roles) || canSetItem("quota", roles);
  const minePayuni = canSetItem("payuni", roles);
  const mineBonus = canSetItem("bonusFlags", roles);

  const sections = row
    ? [
        { mine: mineAm, node: <AmSection key="am" row={row} members={members} canEdit={mineAm} isSuperAdmin={isSuperAdmin} onChanged={reload} /> },
        { mine: mineKol, node: <KolSection key="kol" row={row} roles={roles} onChanged={reload} /> },
        { mine: minePayuni, node: <PayuniSection key="payuni" row={row} isSuperAdmin={isSuperAdmin} /> },
        { mine: mineBonus, node: <BonusVenueSection key="bonus" accId={row.accommodation_id} canEdit={mineBonus} /> },
      ]
    : [];
  const mineSections = sections.filter((s) => s.mine);
  const otherSections = sections.filter((s) => !s.mine);

  return (
    <div className="space-y-6" data-testid="onboarding-venue-page">
      <Link to="/team/onboarding" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="onboarding-back-link">
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
          <Block title="你要設定的" hint="依你的角色可以直接設定的項目，會計入總覽與小鈴鐺的待處理。" testId="onboarding-block-mine">
            {mineSections.map((s) => s.node)}
            {myGaps.length > 0 && <GapsSection gaps={myGaps} roles={roles} accId={row.accommodation_id} mine />}
            {mineSections.length === 0 && myGaps.length === 0 && (
              <p className="text-sm text-muted-foreground" data-testid="onboarding-mine-empty">目前沒有需要你設定的項目。</p>
            )}
          </Block>
          <Block title="由其他人設定" hint="由其他角色負責的項目，這裡只顯示狀態，不計入你的待處理。" testId="onboarding-block-others">
            {otherSections.map((s) => s.node)}
            <GapsSection gaps={otherGaps} roles={roles} accId={row.accommodation_id} mine={false} />
          </Block>
        </>
      )}
    </div>
  );
}
