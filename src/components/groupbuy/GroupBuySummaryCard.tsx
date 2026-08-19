import { CheckCircle2, Users } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { GROUP_BUY_DAY_TYPE_LABEL, type NightPrice } from "@/lib/groupBuyPricing";

const twd = (n: number) => `NT$ ${Math.round(n || 0).toLocaleString("en-US")}`;

interface Props {
  packageName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  roomQuantity: number;
  /** 人數組成文字，如「2 成人・1 兒童」 */
  guestSummary: string;
  /** 方案房費小計（未含兒童加價） */
  baseTotal: number;
  /** 兒童／幼兒加價總額 */
  childExtraTotal: number;
  total: number;
  deposit: number;
  balance: number;
  depositPct: number;
  deadlineHours: number;
  available?: boolean;
}

/** 訂單摘要：以「本次應付訂金」為最大字級，其餘為輔助資訊 */
export function GroupBuySummaryCard({
  packageName,
  checkIn,
  checkOut,
  nights,
  roomQuantity,
  guestSummary,
  baseTotal,
  childExtraTotal,
  total,
  deposit,
  balance,
  depositPct,
  deadlineHours,
  available,
}: Props) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/70 p-4 sm:p-5">
      <p className="text-sm font-semibold text-foreground">您的預訂</p>
      <div className="mt-2.5 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">方案</span>
          <span className="text-right font-medium">{packageName}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">入住</span>
          <span className="tabular-nums">{checkIn}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">退房</span>
          <span className="tabular-nums">{checkOut}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">住宿</span>
          <span className="tabular-nums">
            {nights} 晚 × {roomQuantity} 間
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">
            <Users className="mr-1 inline h-4 w-4" />人數
          </span>
          <span className="text-right">{guestSummary}</span>
        </div>
      </div>

      <Separator className="my-3 bg-border/70" />

      <div className="flex items-center justify-between py-1 text-sm">
        <span className="text-muted-foreground">方案房費</span>
        <span className="font-medium tabular-nums">{twd(baseTotal)}</span>
      </div>
      {childExtraTotal > 0 && (
        <div className="flex items-center justify-between py-1 text-sm">
          <span className="text-muted-foreground">兒童加價</span>
          <span className="font-medium tabular-nums">{twd(childExtraTotal)}</span>
        </div>
      )}
      <div className="flex items-center justify-between py-1 text-sm">
        <span className="text-muted-foreground">方案總額</span>
        <span className="font-medium tabular-nums">{twd(total)}</span>
      </div>


      <div className="mt-1.5 rounded-xl bg-accent/10 px-3 py-3">
        <p className="text-sm font-semibold text-foreground">本次應付訂金（{depositPct}%）</p>
        <p className="mt-1 text-[2rem] font-bold leading-none tabular-nums text-accent">{twd(deposit)}</p>
      </div>

      <div className="flex items-center justify-between py-1 pt-2 text-sm">
        <span className="text-muted-foreground">入住支付尾款</span>
        <span className="tabular-nums">{twd(balance)}</span>
      </div>

      {available && (
        <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> 此日期目前可預訂
        </p>
      )}
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        訂單成立後 {deadlineHours} 小時內未完成訂金匯款，系統將自動取消。
      </p>
    </div>
  );
}

export default GroupBuySummaryCard;
