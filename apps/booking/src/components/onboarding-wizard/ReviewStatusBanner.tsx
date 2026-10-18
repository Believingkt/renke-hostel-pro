import type { FinalCheck } from "@/hooks/use-wizard-data";

/** 送審狀態：待核准／已退回（含退回原因） */
export function ReviewStatusBanner({ finalCheck }: { finalCheck: FinalCheck | null }) {
  if (finalCheck?.status === "submitted") {
    return (
      <div className="rounded-md border border-primary/40 bg-primary/5 px-4 py-3 text-sm" data-testid="wizard-status-submitted">
        <span className="font-medium">已送審，等待總部核准。</span>精靈目前為唯讀；一般 PMS 頁面仍可編輯。
      </div>
    );
  }
  if (finalCheck?.status === "returned") {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm" data-testid="wizard-status-returned">
        <p className="font-medium text-destructive">總部已退回，請修改後再次送審。</p>
        <p className="mt-1" data-testid="wizard-return-reason">退回原因：{finalCheck.return_reason}</p>
      </div>
    );
  }
  return null;
}
