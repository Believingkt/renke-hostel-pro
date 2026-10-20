import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { KolReciprocalQuotaTab } from "@/components/team/KolReciprocalQuotaTab";
import { OnbStatusBadge } from "./OnbStatusBadge";
import { canEditKolQuota, canManageKolVenue, kolStatus, quotaStatus, type OnboardingRow } from "@/lib/teamOnboarding";

export function KolSection({ row, roles, onChanged }: { row: OnboardingRow; roles: string[]; onChanged: () => void }) {
  const [creating, setCreating] = useState(false);
  const canVenue = canManageKolVenue(roles);

  const createVenue = async () => {
    setCreating(true);
    const { error } = await supabase
      .from("kol_venues" as any)
      .insert({ name: row.accommodation_name, type: "民宿", is_active: true, accommodation_id: row.accommodation_id });
    setCreating(false);
    if (error) return toast.error(error.message);
    toast.success("已建立 KOL 場域，請接著設定邀約規則");
    onChanged();
  };

  return (
    <Card data-testid="onboarding-kol-section">
      <CardHeader>
        <CardTitle className="text-base">KOL／星探</CardTitle>
        <CardDescription>KOL 場域沒建立，正式邀約與邀約目標的館別下拉就不會出現此館。星探主管可建立場域與邀約規則；互惠額度由星探主管與 AM 設定。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">KOL 場域：</span>
          <OnbStatusBadge status={kolStatus(row)} testId="onboarding-kol-status" />
          <span className="text-muted-foreground">本月互惠額度：</span>
          <OnbStatusBadge status={quotaStatus(row)} testId="onboarding-quota-status" />
        </div>
        <div className="flex flex-wrap gap-2">
          {canVenue && !row.kol_venue_id && (
            <Button size="sm" onClick={createVenue} disabled={creating} data-testid="onboarding-create-kol-venue-btn">建立 KOL 場域</Button>
          )}
          {canVenue && (
            <Button size="sm" variant="outline" asChild data-testid="onboarding-kol-venues-link">
              <Link to="/team/kol?tab=venues">設定邀約規則（場域邀約管理）</Link>
            </Button>
          )}
          {!canVenue && <p className="text-xs text-muted-foreground">KOL 場域與邀約規則由星探主管設定。</p>}
        </div>
        <KolReciprocalQuotaTab
          isManager={canEditKolQuota(roles)}
          defaultAccommodationId={row.accommodation_id}
          allowedAccommodationIds={[row.accommodation_id]}
          lockedAccommodation
        />
      </CardContent>
    </Card>
  );
}
