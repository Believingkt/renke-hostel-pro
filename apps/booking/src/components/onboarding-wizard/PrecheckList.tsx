import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { PrecheckResult } from "@/lib/onboarding/wizardApi";

/** 開賣前檢查結果（精靈送審頁與總部核准對話框共用） */
export function PrecheckList({ result }: { result: PrecheckResult }) {
  return (
    <div className="space-y-3" data-testid="precheck-list">
      <p className="text-xs text-muted-foreground">檢查區間：{result.window_start}～{result.window_end}</p>
      <ul className="space-y-2">
        {result.red.map((r) => (
          <li key={r.key} className="flex items-start gap-2 text-sm" data-testid={`precheck-red-${r.key}`}>
            {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
            <span>
              <span className={r.ok ? "" : "font-medium text-destructive"}>{r.label}</span>
              <span className="ml-1 text-muted-foreground">— {r.detail}</span>
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
      <p className={`text-sm font-medium ${result.red_ok ? "text-primary" : "text-destructive"}`} data-testid="precheck-summary">
        {result.red_ok ? "紅色項目全部通過" : "還有紅色項目未通過"}
      </p>
    </div>
  );
}
