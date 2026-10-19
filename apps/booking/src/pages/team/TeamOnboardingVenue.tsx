import { Link, useParams } from "react-router-dom";
import { useTeam } from "@lakeze/shared/components/team/TeamContext";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { useTeamOnboarding } from "@/hooks/use-team-onboarding";
import { useVenueGaps } from "@/hooks/use-venue-gaps";
import { OnboardingRoleGuide } from "@/components/team/onboarding/OnboardingRoleGuide";
import { AmSection } from "@/components/team/onboarding/AmSection";
import { KolSection } from "@/components/team/onboarding/KolSection";
import { GapsSection, PayuniSection } from "@/components/team/onboarding/GapsSection";
import { STAGE_LABEL, canAssignAm, canViewOnboarding, venueStage } from "@/lib/teamOnboarding";

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

  return (
    <div className="space-y-4" data-testid="onboarding-venue-page">
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
          <AmSection row={row} members={members} canEdit={canAssignAm(roles)} isSuperAdmin={isSuperAdmin} onChanged={reload} />
          <KolSection row={row} roles={roles} onChanged={reload} />
          <GapsSection gaps={gapsByAcc.get(row.accommodation_id) ?? []} roles={roles} accId={row.accommodation_id} />
          <PayuniSection row={row} isSuperAdmin={isSuperAdmin} />
        </>
      )}
    </div>
  );
}
