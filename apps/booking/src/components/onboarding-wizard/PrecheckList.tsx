import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { PrecheckResult } from "@/lib/onboarding/wizardApi";

interface Props {
  result: PrecheckResult;
  /** owner：業主（只看白話說明）；hq：總部核准對話框（附技術名稱與 OTA 狀態） */
  audience?: "owner" | "hq";
}

/** 開賣前檢查結果（精靈送審頁與總部核准對話框共用） */
export function PrecheckList({ result, audience = "owner" }: Props) {
  const hq = audience === "hq";
  return (
    <div className="space-y-3" data-testid="precheck-list">
      <p className="text-xs text-muted-foreground">檢查區間：{result.window_start}～{result.window_end}</p>
      <ul className="space-y-2.5">
        {result.red.map((r) => (
          <li key={r.key} className="flex items-start gap-2 text-sm" data-testid={`precheck-red-${r.key}`}>
            {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
            <span>
              <span className={r.ok ? "" : "font-medium text-destructive"}>{r.label}</span>
              <span className="ml-1 text-muted-foreground">— {hq && r.hq_detail ? r.hq_detail : r.detail}</span>
            </span>
          </li>
        ))}
        {result.yellow.map((y) => (
          <li key={y.key} className="flex items-start gap-2 text-sm" data-testid={`precheck-yellow-${y.key}`}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>
              <span className="font-medium">{y.label}</span>
              <span className="ml-1 text-muted-foreground">— {y.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {hq && result.ota_status && (
        <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm" data-testid="precheck-ota-status">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span><span className="font-medium">OTA 串接狀態（僅供參考，不影響核准）</span><span className="ml-1 text-muted-foreground">— {result.ota_status.detail}</span></span>
        </div>
      )}
      <p className={`text-sm font-medium ${result.red_ok ? "text-primary" : "text-destructive"}`} data-testid="precheck-summary">
        {result.red_ok ? "紅色項目全部通過" : "還有紅色項目未通過"}
      </p>
    </div>
  );
}
