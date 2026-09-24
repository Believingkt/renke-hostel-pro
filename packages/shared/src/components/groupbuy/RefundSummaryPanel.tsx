import { Undo2 } from "lucide-react";

/**
 * 團購訂單查詢頁的「取消／退款摘要」。
 *
 * 金額 SoT 一律來自 group-buy-order-lookup 的 refund 物件（server 計算），
 * 前台不得自行重算取消政策比例。
 */
export interface RefundSummaryData {
  status?: string | null;
  paidAmount?: number | null;
  policyRefundAmount?: number | null;
  feeAmount?: number | null;
  expectedFeeAmount?: number | null;
  expectedPayoutAmount?: number | null;
  refundedAmount?: number | null;
  remainingRefundable?: number | null;
  refundedAt?: string | null;
  paymentMethodLabel?: string | null;
  refundChannelLabel?: string | null;
  isCardOrder?: boolean | null;
}

const twd = (n: unknown) => `NT$${Math.max(0, Math.round(Number(n) || 0)).toLocaleString("en-US")}`;

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold text-foreground" : "text-foreground"}>{value}</span>
    </div>
  );
}

export function RefundSummaryPanel({ refund }: { refund: RefundSummaryData }) {
  const status = String(refund.status ?? "none");
  const done = status === "refunded";
  const partial = status === "partial_refunded";
  const isCard = refund.isCardOrder === true;
  const fee = Math.max(0, Math.round(Number(refund.feeAmount) || 0));
  const expectedFee = Math.max(0, Math.round(Number(refund.expectedFeeAmount) || 0));
  const settledOrPending = done || partial;

  return (
    <div className="rounded-lg border p-4 text-sm">
      <p className="mb-1 flex items-center gap-2 font-semibold text-foreground">
        <Undo2 className="h-4 w-4" />
        {done ? "退款已完成" : partial ? "已部分退款" : status === "none" ? "不需退款" : "退款處理中"}
      </p>

      <Row label="原付款方式" value={refund.paymentMethodLabel || "未指定付款方式"} />
      <Row label={isCard ? "已付款金額" : "已收訂金"} value={twd(refund.paidAmount)} />
      <Row label="依取消政策應退" value={twd(refund.policyRefundAmount)} />

      {/* 信用卡原卡退刷不收人工退款手續費，一律不顯示 */}
      {!isCard && (settledOrPending ? fee > 0 : expectedFee > 0) && (
        <Row label="人工退款手續費" value={`-${twd(settledOrPending ? fee : expectedFee)}`} />
      )}

      {settledOrPending ? (
        <>
          <Row label="實際已退款" value={twd(refund.refundedAmount)} strong />
          <Row label="剩餘待退款" value={twd(refund.remainingRefundable)} />
        </>
      ) : (
        <Row label="預計實際退款" value={twd(refund.expectedPayoutAmount)} strong />
      )}

      <Row label="退款方式" value={refund.refundChannelLabel || (isCard ? "原信用卡退刷（TapPay）" : "人工匯款退款")} />
      <Row
        label="退款狀態"
        value={done ? "退款完成" : partial ? "部分退款" : status === "none" ? "不需退款" : "待處理"}
      />

      {refund.refundedAt && (
        <Row
          label="退款完成時間"
          value={new Date(refund.refundedAt).toLocaleString("zh-TW", {
            timeZone: "Asia/Taipei",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        />
      )}
    </div>
  );
}

export default RefundSummaryPanel;
