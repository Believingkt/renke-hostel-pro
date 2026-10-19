import { Card, CardContent, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import type { useWizardData } from "@/hooks/use-wizard-data";
import type { PrecheckResult } from "@/lib/onboarding/wizardApi";
import { WIZARD_STEPS, stepDone } from "@/lib/onboarding/wizardSteps";
import { WizardStepper } from "./WizardStepper";
import { BasicInfoStep } from "./BasicInfoStep";
import { RoomTypeForm } from "./RoomTypeForm";
import { PackageStep } from "./PackageStep";
import { SeasonStep } from "./SeasonStep";
import { InventoryStep } from "./InventoryStep";
import { SubmitStep } from "./SubmitStep";
import type { Flow } from "./FlowChooser";

type Data = ReturnType<typeof useWizardData>;

interface Props {
  accommodationId: string;
  data: Data;
  flow: Flow;
  step: number;
  precheck: PrecheckResult | null;
  onStep: (i: number) => void;
  onChanged: () => void;
}

/** 精靈主體：步驟列＋目前步驟內容（頁面與本機截圖共用） */
export function WizardBody({ accommodationId, data, flow, step, precheck, onStep, onChanged }: Props) {
  const single = flow === "single";
  const done = WIZARD_STEPS.map((s) => stepDone(s.key, precheck, data.finalCheck?.status === "submitted"));
  const key = WIZARD_STEPS[step].key;

  return (
    <div className="space-y-6">
      <WizardStepper current={step} done={done} onSelect={onStep} />
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">
            {step + 1}. {WIZARD_STEPS[step].title}
            <span className="ml-2 text-sm font-normal text-muted-foreground">（{single ? "單棟包棟" : "多房型"}）</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {key === "basic" && data.basicInfo && (
            <BasicInfoStep key={data.basicInfo.name ?? ""} accommodationId={accommodationId} info={data.basicInfo} locked={data.locked} onSaved={onChanged} />
          )}
          {key === "rooms" && (
            <div className="space-y-5">
              {data.roomTypes.map((rt) => (
                <RoomTypeForm key={rt.id} accommodationId={accommodationId} roomType={rt} singleUnit={single} locked={data.locked} onSaved={onChanged} />
              ))}
              {!data.locked && (!single || data.roomTypes.length === 0) && (
                <RoomTypeForm accommodationId={accommodationId} singleUnit={single} locked={false} onSaved={onChanged} />
              )}
            </div>
          )}
          {key === "packages" && <PackageStep accommodationId={accommodationId} data={data} single={single} />}
          {key === "season" && <SeasonStep packages={data.packages} locked={data.locked} />}
          {key === "inventory" && <InventoryStep accommodationId={accommodationId} roomTypes={data.roomTypes} locked={data.locked} onDone={onChanged} />}
          {key === "submit" && <SubmitStep accommodationId={accommodationId} locked={data.locked} onSubmitted={onChanged} />}
          <div className="flex justify-between border-t pt-4">
            <Button variant="outline" disabled={step === 0} onClick={() => onStep(step - 1)} data-testid="wizard-prev-btn">上一步</Button>
            <Button variant="outline" disabled={step === WIZARD_STEPS.length - 1} onClick={() => onStep(step + 1)} data-testid="wizard-next-btn">下一步</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
