import { useState } from "react";
import { CheckCircle2, Circle, Building2, ArrowRight, Loader2 } from "lucide-react";
import { Card, CardContent } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Progress } from "@lakeze/shared/components/ui/progress";
import { PreloadLink } from "@lakeze/shared/components/PreloadLink";
import { AdminPageHeader } from "@lakeze/shared/components/AdminPageHeader";
import { useAliasPrefix } from "@lakeze/shared/hooks/use-alias-prefix";
import { useAccommodation } from "@lakeze/shared/contexts/AccommodationContext";
import { useOnboardingProgress } from "@/hooks/use-onboarding-progress";
import { canFinalConfirm, type StepResult } from "@/lib/onboarding/steps";
import { toast } from "sonner";

function StepIcon({ status }: { status: StepResult["status"] }) {
  if (status === "completed") return <CheckCircle2 className="h-5 w-5 text-primary" />;
  if (status === "hq") return <Building2 className="h-5 w-5 text-muted-foreground" />;
  return <Circle className="h-5 w-5 text-muted-foreground" />;
}

export default function Onboarding() {
  const { currentAccommodationId } = useAccommodation();
  const { withPrefix } = useAliasPrefix();
  const { steps, done, total, loading, confirmStep } = useOnboardingProgress(currentAccommodationId);
  const [saving, setSaving] = useState<string | null>(null);

  const handleConfirm = async (step: StepResult) => {
    if (step.key === "final_check" && !canFinalConfirm(steps)) return;
    setSaving(step.key);
    const { error } = await confirmStep(step.key);
    setSaving(null);
    if (error) toast.error(`儲存失敗：${error}`);
    else toast.success(`已確認「${step.title}」`);
  };

  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="上架引導" description="照著下面的順序完成設定，就能把民宿放上網站開始接單。" />

      {!loading && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-base font-medium">上架完成度</span>
              <span className="text-2xl font-semibold tabular-nums">{percent}%</span>
            </div>
            <Progress value={percent} />
            <p className="text-sm text-muted-foreground">
              必要項目已完成 {done} / {total} 項。標示「總部設定」與「選填」的項目不計入。
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {steps.map((step) => {
          const isConfirm = step.kind === "confirm";
          const finalLocked = step.key === "final_check" && !canFinalConfirm(steps);
          return (
            <Card key={step.key} className={step.status === "completed" ? "border-primary/40" : undefined}>
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5"><StepIcon status={step.status} /></span>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-medium">
                        {step.no}. {step.title}
                      </span>
                      {step.optional && <Badge variant="secondary">選填</Badge>}
                      {step.kind === "hq" && <Badge variant="outline">總部設定</Badge>}
                      {step.status === "completed" && <Badge>已完成</Badge>}
                      {step.status === "pending" && !step.optional && step.kind !== "hq" && (
                        <Badge variant="secondary">待完成</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{step.hqValue ? `${step.hint}（${step.hqValue}）` : step.hint}</p>
                  </div>
                </div>

                <div className="flex shrink-0 gap-2 sm:justify-end">
                  {step.link && (
                    <Button asChild variant="outline" size="sm">
                      <PreloadLink to={withPrefix(step.link.split("?")[0]) + (step.link.includes("?") ? `?${step.link.split("?")[1]}` : "")}>
                        前往設定 <ArrowRight className="ml-1 h-4 w-4" />
                      </PreloadLink>
                    </Button>
                  )}
                  {isConfirm && step.status !== "completed" && (
                    <Button size="sm" disabled={finalLocked || saving === step.key} onClick={() => handleConfirm(step)}>
                      {saving === step.key && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                      {finalLocked ? "尚未符合條件" : "我已確認"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
