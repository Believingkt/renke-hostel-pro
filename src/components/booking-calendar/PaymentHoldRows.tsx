import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { packHoldRows, remainingText, type PaymentHoldEvent } from "@/lib/paymentHoldEvents";

interface Props {
  events: PaymentHoldEvent[];
  dateStrings: string[];
  dayColWidth: number;
  leftColWidth: number;
  daysRowStyle: React.CSSProperties;
  dayColumnStyle: React.CSSProperties;
}

/** 倒數只做顯示；是否仍占房以 DB expires_at 為準 */
function Countdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return <span className="tabular-nums">剩餘 {remainingText(expiresAt, now)}</span>;
}

/**
 * 預定管理月曆的「團購付款保留」列（唯讀顯示）。
 *
 * 付款保留不是正式訂單：不可點擊開啟訂單、不可取消／退款／改期。
 * 詳細資訊請至團購後台的「付款保留」分頁查看。
 */
export function PaymentHoldRows({ events, dateStrings, dayColWidth, leftColWidth, daysRowStyle, dayColumnStyle }: Props) {
  if (events.length === 0) return null;
  const rows = packHoldRows(events);
  const lastDate = dateStrings[dateStrings.length - 1];

  return (
    <>
      {rows.map((row, idx) => (
        <div key={`hold-row-${idx}`} className="flex border-b last:border-b-0 bg-amber-50/40 dark:bg-amber-900/10">
          <div
            className="shrink-0 border-r p-2 pl-8 text-sm flex items-center gap-1 sticky left-0 bg-card z-20"
            style={{ width: leftColWidth, minWidth: leftColWidth }}
          >
            <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="font-medium text-amber-700 dark:text-amber-300 truncate">付款保留</span>
          </div>
          <div className="flex shrink-0 relative" style={{ ...daysRowStyle, minHeight: 48 }}>
            {dateStrings.map((d) => (
              <div key={d} className="shrink-0 border-r last:border-r-0" style={dayColumnStyle} />
            ))}
            {row.map((e) => {
              const visibleStart = e.check_in_date < dateStrings[0] ? dateStrings[0] : e.check_in_date;
              const startIdx = dateStrings.indexOf(visibleStart);
              if (startIdx === -1) return null;
              // [check_in, check_out)：退房日不占用
              const endIdx = dateStrings.indexOf(e.check_out_date);
              const span = endIdx === -1
                ? (e.check_out_date > lastDate ? dateStrings.length - startIdx : 0)
                : endIdx - startIdx;
              if (span <= 0) return null;
              return (
                <TooltipProvider key={e.id} delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "absolute top-1 bottom-1 z-[5] rounded-md border-2 border-dashed cursor-default",
                          "border-amber-500 bg-amber-100/80 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200",
                          "flex items-center gap-1 px-2 text-xs overflow-hidden",
                        )}
                        style={{ left: startIdx * dayColWidth, width: span * dayColWidth }}
                      >
                        <Clock className="h-3 w-3 shrink-0" />
                        <span className="font-medium truncate">{e.guestName}</span>
                        {e.total > 1 && (
                          <span className="shrink-0 tabular-nums">{e.index}/{e.total} 間</span>
                        )}
                        <span className="ml-auto shrink-0 hidden sm:inline">
                          <Countdown expiresAt={e.expiresAt} />
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-sm whitespace-pre-line max-w-xs">
                      {`⏱ 團購付款保留（非正式訂單）\n${e.guestName}\n${e.check_in_date} → ${e.check_out_date}\n占用 ${e.total} 間（此列為第 ${e.index} 間）\n詳細資訊請至團購後台「付款保留」分頁`}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

export default PaymentHoldRows;
