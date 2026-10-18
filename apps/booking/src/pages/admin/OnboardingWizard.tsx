import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { AdminPageHeader } from "@lakeze/shared/components/AdminPageHeader";
import { PreloadLink } from "@lakeze/shared/components/PreloadLink";
import { useAccommodation } from "@lakeze/shared/contexts/AccommodationContext";
import { useStaffPermissions } from "@lakeze/shared/hooks/use-staff-permissions";
import { useAliasPrefix } from "@lakeze/shared/hooks/use-alias-prefix";
import { useWizardData } from "@/hooks/use-wizard-data";
import { RoomTypeForm } from "@/components/onboarding-wizard/RoomTypeForm";
import { PackageStep } from "@/components/onboarding-wizard/PackageStep";
import { SeasonStep } from "@/components/onboarding-wizard/SeasonStep";
import { InventoryStep } from "@/components/onboarding-wizard/InventoryStep";
import { SubmitStep } from "@/components/onboarding-wizard/SubmitStep";
import { ReviewStatusBanner } from "@/components/onboarding-wizard/ReviewStatusBanner";

const STEPS = ["房型", "方案", "季節價（選填）", "庫存", "檢查與送審"];
type Flow = "single" | "multi";

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
  const inferred: Flow | null = data.roomTypes.length === 0 ? null
    : data.roomTypes.length === 1 && data.roomTypes[0].room_count === 1 ? "single" : "multi";
  const flow = chosen ?? inferred;

  if (permLoading || data.loading || !currentAccommodationId) return <p className="text-sm text-muted-foreground">載入中…</p>;
  if (!isStrictAdmin) return <Notice text="上架精靈只開放本館管理員與總部最高管理員使用。您目前的帳號可以檢視上架清單，但不能透過精靈修改設定，如需協助請聯絡本館管理員。" />;
  if (data.isActive) return <Notice text="此館已開賣，上架精靈只用於尚未開賣的館。請改用一般 PMS 頁面調整房型、方案與房價。" />;

  return (
    <div className="space-y-6" data-testid="onboarding-wizard-page">
      <AdminPageHeader title="上架精靈" description="一步一步建立房型、方案與庫存，完成後送總部審核開賣。" />
      <ReviewStatusBanner finalCheck={data.finalCheck} />

      {!flow ? (
        <Card>
          <CardHeader><CardTitle className="text-base">請選擇民宿類型</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Button variant="outline" className="h-auto flex-col items-start p-4 text-left" onClick={() => setChosen("single")} data-testid="wizard-flow-single">
              <span className="font-medium">單棟包棟</span><span className="text-xs text-muted-foreground">整棟一起賣：1 個房型、房間數 1，自動帶一個包棟方案</span>
            </Button>
            <Button variant="outline" className="h-auto flex-col items-start p-4 text-left" onClick={() => setChosen("multi")} data-testid="wizard-flow-multi">
              <span className="font-medium">多房型</span><span className="text-xs text-muted-foreground">分房販售：可建立多個房型與方案</span>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <ol className="flex flex-wrap gap-2" data-testid="wizard-stepper">
            {STEPS.map((s, i) => (
              <li key={s}>
                <Button size="sm" variant={i === step ? "default" : "outline"} onClick={() => setStep(i)} data-testid={`wizard-step-${i}`}>{i + 1}. {s}</Button>
              </li>
            ))}
          </ol>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{step + 1}. {STEPS[step]}<span className="ml-2 text-xs font-normal text-muted-foreground">（{flow === "single" ? "單棟包棟" : "多房型"}）</span></CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {step === 0 && (
                <>
                  {data.roomTypes.map((rt) => (
                    <RoomTypeForm key={rt.id} accommodationId={currentAccommodationId} roomType={rt} singleUnit={flow === "single"} locked={data.locked} onSaved={data.reload} />
                  ))}
                  {!data.locked && (flow === "multi" || data.roomTypes.length === 0) && (
                    <RoomTypeForm accommodationId={currentAccommodationId} singleUnit={flow === "single"} locked={false} onSaved={data.reload} />
                  )}
                </>
              )}
              {step === 1 && <PackageStep accommodationId={currentAccommodationId} data={data} single={flow === "single"} />}
              {step === 2 && <SeasonStep packages={data.packages} locked={data.locked} />}
              {step === 3 && <InventoryStep accommodationId={currentAccommodationId} roomTypes={data.roomTypes} locked={data.locked} onDone={data.reload} />}
              {step === 4 && <SubmitStep accommodationId={currentAccommodationId} locked={data.locked} onSubmitted={data.reload} />}
              <div className="flex justify-between border-t pt-3">
                <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => setStep(step - 1)} data-testid="wizard-prev-btn">上一步</Button>
                <Button variant="ghost" size="sm" disabled={step === STEPS.length - 1} onClick={() => setStep(step + 1)} data-testid="wizard-next-btn">下一步</Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
