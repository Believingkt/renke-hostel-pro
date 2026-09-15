import { Badge } from "@/components/ui/badge";
import { CalendarDays, Clock } from "lucide-react";
import { SALE_STATE_LABEL, saleState, type CampaignWindow } from "@/lib/groupBuyDateRules";
import { cn } from "@/lib/utils";

const fmtDateTime = (iso?: string | null) =>
  iso && !isNaN(new Date(iso).getTime())
    ? new Intl.DateTimeFormat("zh-TW", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(iso))
    : "不限";

/** 活動窗口視覺化摘要：開賣 / 結束時間、可入住起迄 */
export function CampaignWindowSummary({
  campaign,
  className,
}: {
  campaign: CampaignWindow;
  className?: string;
}) {
  const state = saleState(campaign);
  const variant = state === "on_sale" ? "default" : state === "not_started" ? "secondary" : "destructive";

  return (
    <div className={cn("rounded-xl border border-border bg-muted/40 p-3 text-sm", className)}>
      <div className="mb-2 flex items-center gap-2">
        <Badge variant={variant}>{SALE_STATE_LABEL[state]}</Badge>
        <span className="text-xs text-muted-foreground">活動窗口</span>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">販售期間</p>
            <p className="tabular-nums text-foreground">
              {fmtDateTime(campaign.sale_start)} ~ {fmtDateTime(campaign.sale_end)}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">可入住期間</p>
            <p className="tabular-nums text-foreground">
              {campaign.stay_start_date ?? "不限"} ~ {campaign.stay_end_date ?? "不限"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
