import { useCallback, useEffect, useState } from "react";
import { Button } from "@lakeze/shared/components/ui/button";
import { toast } from "sonner";
import { wizardApi, type PrecheckResult } from "@/lib/onboarding/wizardApi";
import { PrecheckList } from "./PrecheckList";

/** 開賣前檢查＋送審：紅色全過才可送審（OTA 不屬於初始上架，不在此檢查） */
export function SubmitStep({ accommodationId, locked, onSubmitted }: { accommodationId: string; locked: boolean; onSubmitted: () => void }) {
  const [result, setResult] = useState<PrecheckResult | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    try { setResult(await wizardApi.precheck(accommodationId)); } catch (e) { toast.error((e as Error).message); }
  }, [accommodationId]);
  useEffect(() => { void check(); }, [check]);

  const submit = async () => {
    setBusy(true);
    try {
      await wizardApi.submit(accommodationId);
      toast.success("已送審，請等待總部核准");
      onSubmitted();
    } catch (e) {
      toast.error((e as Error).message);
      void check();
    } finally {
      setBusy(false);
    }
  };

  if (!result) return <p className="text-sm text-muted-foreground">檢查中…</p>;
  return (
    <div className="space-y-4" data-testid="submit-step">
      <PrecheckList result={result} audience="owner" />
      <Button variant="outline" size="sm" onClick={check} data-testid="precheck-refresh-btn">重新檢查</Button>
      {!locked && (
        <div className="space-y-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">送審後精靈改為唯讀，總部核准後才會開賣；OTA（OwlTing 等）在開賣後由總部另行串接。</p>
          <Button onClick={submit} disabled={busy || !result.red_ok} data-testid="wizard-submit-btn">
            {result.red_ok ? "送出審核" : "紅色項目未通過，不能送審"}
          </Button>
        </div>
      )}
    </div>
  );
}
