import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, Loader2 } from "lucide-react";
import type { PayoutPeriod } from "@/lib/scoutPayoutPeriod";

interface Props {
  /** 目前檢視的期別 */
  period: PayoutPeriod;
  /** 上一期（供切換） */
  prevPeriod: PayoutPeriod;
  /** 是否正在看上一期 */
  viewingPrev: boolean;
  onChange: (viewingPrev: boolean) => void;
  /** 資料讀取中：鎖住切換並顯示提示，避免重複切換 */
  loading?: boolean;
}

/**
 * TeamHome 期別橫幅：顯示目前檢視的發放期別與資料窗，並提供「上一期 / 本期」切換。
 * 預設為依台北時間今日自動判定的「即將發放的下一期」。
 */
export default function PayoutPeriodBanner({
  period,
  prevPeriod,
  viewingPrev,
  onChange,
  loading,
}: Props) {
  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
      <div className="flex items-center gap-2 text-sm">
        <CalendarClock className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="font-medium">
          {viewingPrev ? "檢視已過期別" : "即將發放"}：{period.label}
        </span>
        <span className="text-muted-foreground text-xs">
          （資料窗 {period.windowLabel}）
        </span>
      </div>

      <div className="flex items-center gap-1.5 sm:ml-auto">
        {loading && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            讀取計算中…
          </span>
        )}
        <Button
          size="sm"
          variant={viewingPrev ? "default" : "outline"}
          className="h-7 text-xs"
          disabled={loading}
          onClick={() => onChange(true)}
        >
          上一期（{prevPeriod.label}）
        </Button>
        <Button
          size="sm"
          variant={viewingPrev ? "outline" : "default"}
          className="h-7 text-xs"
          disabled={loading}
          onClick={() => onChange(false)}
        >
          本期
        </Button>
        {!period.isMonthlyPayout && (
          <Badge variant="secondary" className="text-[10px]">
            僅星探系發放
          </Badge>
        )}
      </div>
    </div>
  );
}

