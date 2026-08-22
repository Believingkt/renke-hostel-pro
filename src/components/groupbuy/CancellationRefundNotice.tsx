import {
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
  className?: string;
}

/**
 * 團購取消／退款規則說明（共用展示元件）。
 * 文案來源固定為 src/lib/refundPolicy.ts，任何位置都不得自行 hardcode。
 */
export function CancellationRefundNotice({
  showPendingReview = false,
  className,
}: CancellationRefundNoticeProps) {
  return (
    <div className={className}>
      <p className="text-sm font-semibold text-foreground">{REFUND_SCHEDULE_TITLE}</p>
      <p className="mt-1 text-sm text-muted-foreground">{REFUND_SCHEDULE_INTRO}</p>
      <ul className="mt-1.5 space-y-1">
        {REFUND_SCHEDULE_RULES.map((rule) => (
          <li key={rule} className="flex items-start gap-2 text-sm text-foreground">
            <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
            <span className="min-w-0 break-words">{rule}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-foreground">
        退款將扣除{" "}
        <span className="font-semibold text-primary">NT${REFUND_HANDLING_FEE}</span> 匯款手續費。
        <span className="sr-only">{REFUND_FEE_TEXT}</span>
      </p>
      {showPendingReview && (
        <p className="mt-1 text-sm text-muted-foreground">{REFUND_PENDING_REVIEW_TEXT}</p>
      )}
    </div>
  );
}

export default CancellationRefundNotice;
