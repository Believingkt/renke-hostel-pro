import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { AdminPageHeader } from "@lakeze/shared/components/AdminPageHeader";
import { PreloadLink } from "@lakeze/shared/components/PreloadLink";
import { useAccommodation } from "@lakeze/shared/contexts/AccommodationContext";
import { useStaffPermissions } from "@lakeze/shared/hooks/use-staff-permissions";
import { useAliasPrefix } from "@lakeze/shared/hooks/use-alias-prefix";
import { useWizardData } from "@/hooks/use-wizard-data";
import { wizardApi, type PrecheckResult } from "@/lib/onboarding/wizardApi";
import { FlowChooser, type Flow } from "@/components/onboarding-wizard/FlowChooser";
import { WizardBody } from "@/components/onboarding-wizard/WizardBody";
import { ReviewStatusBanner } from "@/components/onboarding-wizard/ReviewStatusBanner";

function Notice({ text }: { text: string }) {
  const { withPrefix } = useAliasPrefix();
  return (
    <Card data-testid="wizard-readonly-notice">
      <CardContent className="space-y-3 pt-6 text-sm">
        <p>{text}</p>
        <Button asChild variant="outline" size="sm"><PreloadLink to={withPrefix("/admin/onboarding")}>回上架清單</PreloadLink></Button>
      </CardContent>
    </Card>
  );
}

export default function OnboardingWizard() {
  const { currentAccommodationId } = useAccommodation();
  const { isStrictAdmin, isLoading: permLoading } = useStaffPermissions();
  const data = useWizardData(currentAccommodationId);
  const [step, setStep] = useState(0);
  const [chosen, setChosen] = useState<Flow | null>(null);
  const [precheck, setPrecheck] = useState<PrecheckResult | null>(null);
  const inferred: Flow | null = data.roomTypes.length === 0 ? null
    : data.roomTypes.length === 1 && data.roomTypes[0].room_count === 1 ? "single" : "multi";
  const flow = chosen ?? inferred;
  const ready = !!currentAccommodationId && isStrictAdmin && data.isActive === false;

  const refreshPrecheck = useCallback(() => {
    if (!currentAccommodationId) return;
    wizardApi.precheck(currentAccommodationId).then(setPrecheck, () => setPrecheck(null));
  }, [currentAccommodationId]);
  useEffect(() => { if (ready && !data.loading) refreshPrecheck(); }, [ready, data.loading, refreshPrecheck]);
  const onChanged = () => { void data.reload(); };

  if (permLoading || data.loading || !currentAccommodationId) return <p className="text-sm text-muted-foreground">載入中…</p>;
  if (!isStrictAdmin) return <Notice text="上架精靈只開放本館管理員與總部最高管理員使用。您目前的帳號可以檢視上架清單，但不能透過精靈修改設定，如需協助請聯絡本館管理員。" />;
  if (data.isActive) return <Notice text="此館已開賣，上架精靈只用於尚未開賣的館。請改用一般 PMS 頁面調整房型、方案與房價。" />;

  return (
    <div className="mx-auto max-w-5xl space-y-6" data-testid="onboarding-wizard-page">
      <AdminPageHeader title="上架精靈" description="一步一步填好基本資料、房型、方案與庫存，完成後送總部審核開賣。" />
      <ReviewStatusBanner finalCheck={data.finalCheck} />
      {!flow ? (
        <FlowChooser value={chosen} onChoose={setChosen} />
      ) : (
        <WizardBody accommodationId={currentAccommodationId} data={data} flow={flow} step={step} precheck={precheck} onStep={setStep} onChanged={onChanged} />
      )}
    </div>
  );
}
