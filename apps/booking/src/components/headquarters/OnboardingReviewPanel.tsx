import { useEffect, useState } from "react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Label } from "@lakeze/shared/components/ui/label";
import { Textarea } from "@lakeze/shared/components/ui/textarea";
import { toast } from "sonner";
import { wizardApi, type PrecheckResult } from "@/lib/onboarding/wizardApi";
import { PrecheckList } from "@/components/onboarding-wizard/PrecheckList";

interface Props { accommodationId: string; reviewStatus?: string; onReturned: () => void }

/** 核准對話框內：顯示開賣前檢查結果；待核准的館可填原因退回 */
export function OnboardingReviewPanel({ accommodationId, reviewStatus, onReturned }: Props) {
  const [result, setResult] = useState<PrecheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    wizardApi.precheck(accommodationId).then(setResult, (e: Error) => setError(e.message));
  }, [accommodationId]);

  const submitReturn = async () => {
    if (!reason.trim()) { toast.error("請填寫退回原因"); return; }
    setBusy(true);
    try {
      await wizardApi.returnToOwner(accommodationId, reason.trim());
      toast.success("已退回，業主可以修改後再次送審");
      onReturned();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="hq-review-panel">
      <p className="text-sm font-medium">
        開賣前檢查{reviewStatus === "submitted" ? "（業主已送審）" : "（已退回，待業主再次送審）"}
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {result ? <PrecheckList result={result} audience="hq" /> : !error && <p className="text-sm text-muted-foreground">檢查中…</p>}
      {reviewStatus === "submitted" && !returning && (
        <Button variant="outline" size="sm" onClick={() => setReturning(true)} data-testid="hq-return-btn">退回</Button>
      )}
      {returning && (
        <div className="space-y-2">
          <Label htmlFor="return-reason">退回原因（業主在 PMS 看得到）</Label>
          <Textarea id="return-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="hq-return-reason" />
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={submitReturn} disabled={busy} data-testid="hq-return-confirm">確定退回</Button>
            <Button size="sm" variant="ghost" onClick={() => setReturning(false)} disabled={busy}>取消</Button>
          </div>
        </div>
      )}
    </div>
  );
}
