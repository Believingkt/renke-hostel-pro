import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarClock, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { PayoutPeriod } from "@/lib/scoutPayoutPeriod";

interface Props {
  /** 可檢視的期別清單（由新到舊，index 0 = 即將發放的下一期） */
  periods: PayoutPeriod[];
  /** 目前檢視的期別在清單中的位置 */
  index: number;
  onIndexChange: (index: number) => void;
  /** 資料讀取中：鎖住切換並顯示提示，避免重複切換 */
  loading?: boolean;
}

/**
 * TeamHome 期別橫幅：顯示目前檢視的發放期別與資料窗。
 * 提供最近 6 個月的期別下拉選單與上／下一期快速切換。
 * 預設為依台北時間今日自動判定的「即將發放的下一期」。
 */
export default function PayoutPeriodBanner({
  periods,
  index,
  onIndexChange,
  loading,
}: Props) {
  const period = periods[index] ?? periods[0];
  if (!period) return null;
  const isCurrent = index === 0;
  const canOlder = index < periods.length - 1;
  const canNewer = index > 0;

  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
      <div className="flex items-center gap-2 text-sm">
        <CalendarClock className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="font-medium">
          {isCurrent ? "即將發放" : "檢視已過期別"}：{period.label}
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
          size="icon"
          variant="outline"
          className="h-7 w-7"
          aria-label="更舊一期"
          disabled={loading || !canOlder}
          onClick={() => onIndexChange(index + 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Select
          value={String(index)}
          disabled={loading}
          onValueChange={(v) => onIndexChange(Number(v))}
        >
          <SelectTrigger className="h-7 w-[190px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover z-50">
            {periods.map((p, i) => (
              <SelectItem key={`${p.payoutMonthKey}-${p.period}`} value={String(i)} className="text-xs">
                {p.year} 年 {p.label}
                {i === 0 ? "（即將發放）" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="icon"
          variant="outline"
          className="h-7 w-7"
          aria-label="更新一期"
          disabled={loading || !canNewer}
          onClick={() => onIndexChange(index - 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {!isCurrent && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={loading}
            onClick={() => onIndexChange(0)}
          >
            回本期
          </Button>
        )}
        {!period.isMonthlyPayout && (
          <Badge variant="secondary" className="text-[10px]">
            僅星探系發放
          </Badge>
        )}
      </div>
    </div>
  );
}
