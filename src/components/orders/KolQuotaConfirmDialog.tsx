import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, ArrowRight } from "lucide-react";

interface QuotaStatus {
  yearMonth: string;
  used: number;
  quota: number;
}

interface Props {
  open: boolean;
  yearMonth: string;
  used: number;
  quota: number;
  packageName?: string | null;
  /** 舊月份（改期跨月時用），若提供會與新月份並列顯示 */
  oldStatus?: QuotaStatus | null;
  onCancel: () => void;
  onConfirm: () => void;
}

function QuotaBlock({
  status,
  variant,
}: {
  status: QuotaStatus;
  variant: "old" | "new" | "single";
}) {
  const remaining = Math.max(0, status.quota - status.used);
  const overflow = status.used >= status.quota;
  const label = variant === "old" ? "原月份（釋出 1 筆後）" : variant === "new" ? "新月份（佔用 1 筆後）" : status.yearMonth;
  return (
    <div
      className={`rounded-md border p-3 text-sm ${
        overflow ? "bg-destructive/5 border-destructive/40" : "bg-muted/40"
      }`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold text-foreground text-base tabular-nums">
        {status.yearMonth}
      </div>
      <div className="mt-1 flex items-baseline gap-1 tabular-nums">
        <span className={`text-xl font-bold ${overflow ? "text-destructive" : ""}`}>
          {status.used}
        </span>
        <span className="text-muted-foreground">/ {status.quota}</span>
      </div>
      <div className={`text-xs ${overflow ? "text-destructive" : "text-muted-foreground"}`}>
        {overflow ? `超額 ${status.used - status.quota + 1} 筆` : `剩餘 ${remaining} 筆`}
      </div>
    </div>
  );
}

export function KolQuotaConfirmDialog({
  open,
  yearMonth,
  used,
  quota,
  oldStatus,
  onCancel,
  onConfirm,
}: Props) {
  const newStatus: QuotaStatus = { yearMonth, used, quota };
  const showBoth = !!oldStatus && oldStatus.yearMonth !== yearMonth;

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            KOL 互惠額度已達上限
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                目標月份 <span className="font-semibold text-foreground">{yearMonth}</span>{" "}
                的 KOL 互惠額度不足。強制覆寫將寫入稽核日誌。
              </p>

              {showBoth ? (
                <div className="flex items-stretch gap-2">
                  <div className="flex-1">
                    <QuotaBlock status={oldStatus!} variant="old" />
                  </div>
                  <ArrowRight className="h-5 w-5 self-center flex-shrink-0 text-muted-foreground" />
                  <div className="flex-1">
                    <QuotaBlock status={newStatus} variant="new" />
                  </div>
                </div>
              ) : (
                <QuotaBlock status={newStatus} variant="single" />
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            強制覆寫並改期
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
