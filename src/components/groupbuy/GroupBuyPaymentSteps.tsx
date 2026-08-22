import { Banknote, ClipboardCheck, ShieldCheck, Timer } from "lucide-react";

interface Props {
  depositPercentage: number;
  deadlineHours: number;
}

/** 付款流程：4 個小步驟＋短文字，不做大型流程圖 */
export function GroupBuyPaymentSteps({ depositPercentage, deadlineHours }: Props) {
  const steps = [
    { Icon: ClipboardCheck, label: "完成訂單" },
    { Icon: Banknote, label: "取得匯款資訊" },
    { Icon: Timer, label: `於 ${deadlineHours} 小時內支付訂金（${depositPercentage}%）` },
    { Icon: ShieldCheck, label: "確認訂金後即訂房成功" },
  ];

  return (
    <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
      <p className="text-sm font-semibold text-foreground">付款方式</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        訂房成立後將取得匯款資訊，不會立即扣款；尾款於入住時支付。
      </p>
      <ol className="mt-3 space-y-1.5">
        {steps.map(({ Icon, label }, i) => (
          <li key={label} className="flex items-center gap-2.5 rounded-xl bg-muted/60 px-2.5 py-2">
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold leading-none text-primary tabular-nums">
              {i + 1}
            </span>
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground">{label}</span>
          </li>
        ))}
      </ol>

    </div>
  );
}


export default GroupBuyPaymentSteps;
