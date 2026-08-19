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
    { Icon: Timer, label: `${deadlineHours} 小時內付訂金（${depositPercentage}%）` },
    { Icon: ShieldCheck, label: "完成保留" },
  ];

  return (
    <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
      <p className="text-sm font-semibold text-foreground">付款方式</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        訂房成立後將取得匯款資訊，不會立即扣款；尾款於入住時支付。
      </p>
      <ol className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {steps.map(({ Icon, label }, i) => (
          <li key={label} className="flex items-start gap-2 rounded-xl bg-muted/60 px-2.5 py-2">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="text-xs leading-snug text-muted-foreground">
              <span className="mr-1 font-semibold text-foreground tabular-nums">{i + 1}</span>
              {label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default GroupBuyPaymentSteps;
