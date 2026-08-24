import {
  CREDIT_REFUND_NO_FEE_TEXT,
  CREDIT_REFUND_SCHEDULE_INTRO,
  CREDIT_REFUND_SCHEDULE_RULES,
  CREDIT_REFUND_SCHEDULE_TITLE,
  REFUND_FEE_TEXT,
  REFUND_HANDLING_FEE,
  REFUND_PENDING_REVIEW_TEXT,
  REFUND_SCHEDULE_INTRO,
  REFUND_SCHEDULE_RULES,
  REFUND_SCHEDULE_TITLE,
} from "@/lib/refundPolicy";

interface CancellationRefundNoticeProps {
  /** 是否顯示「在民宿完成審核前，訂單仍維持原訂房狀態。」（僅取消申請中的狀態需要） */
  showPendingReview?: boolean;
  /**
   * 退款管道。
   * - "bank"（預設）：人工匯回，適用銀行匯款／ATM 訂金制訂單。
   * - "credit_card"：TapPay 原卡退刷，不得顯示匯款排程與 NT$30 手續費。
   */
  variant?: "bank" | "credit_card";
  className?: string;
}

/**
 * 團購取消／退款規則說明（共用展示元件）。
 * 文案來源固定為 src/lib/refundPolicy.ts，任何位置都不得自行 hardcode。
 */
export function CancellationRefundNotice({
  showPendingReview = false,
  variant = "bank",
  className,
}: CancellationRefundNoticeProps) {
  const credit = variant === "credit_card";
  const title = credit ? CREDIT_REFUND_SCHEDULE_TITLE : REFUND_SCHEDULE_TITLE;
  const intro = credit ? CREDIT_REFUND_SCHEDULE_INTRO : REFUND_SCHEDULE_INTRO;
  const rules = credit ? CREDIT_REFUND_SCHEDULE_RULES : REFUND_SCHEDULE_RULES;

  return (
    <div className={className}>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{intro}</p>
      <ul className="mt-1.5 space-y-1">
        {rules.map((rule) => (
          <li key={rule} className="flex items-start gap-2 text-sm text-foreground">
            <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
            <span className="min-w-0 break-words">{rule}</span>
          </li>
        ))}
      </ul>
      {credit ? (
        <p className="mt-2 text-sm text-muted-foreground">{CREDIT_REFUND_NO_FEE_TEXT}</p>
      ) : (
        <p className="mt-2 text-sm text-foreground">
          退款將扣除{" "}
          <span className="font-semibold text-primary">NT${REFUND_HANDLING_FEE}</span> 匯款手續費。
          <span className="sr-only">{REFUND_FEE_TEXT}</span>
        </p>
      )}
      {showPendingReview && (
        <p className="mt-1 text-sm text-muted-foreground">{REFUND_PENDING_REVIEW_TEXT}</p>
      )}
    </div>
  );
}

export default CancellationRefundNotice;
