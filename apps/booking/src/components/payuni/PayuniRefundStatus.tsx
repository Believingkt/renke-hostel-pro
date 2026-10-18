import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@lakeze/shared/components/ui/button";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { useBookingLocale } from "@lakeze/shared/contexts/BookingLocaleContext";
import {
  EMPTY_REFUND_BANK_ACCOUNT, isRefundBankAccountValid, RefundBankAccountForm, type RefundBankAccount,
} from "./RefundBankAccountForm";

interface RefundRow {
  mer_trade_no: string; amount: number; status: string; reason: string | null; created_at: string; can_resubmit: boolean;
  bank: { bank_code: string; account_masked: string; holder_masked: string } | null;
}

/** PAYUNi 退款進度；ATM 轉匯失敗時可補填帳戶（會員本人，或後台／總部代填） */
export function PayuniRefundStatus({ as, orderId, orderNumber }: { as: "member" | "admin"; orderId?: string; orderNumber?: string }) {
  const { t } = useBookingLocale();
  const [rows, setRows] = useState<RefundRow[]>([]);
  const [acct, setAcct] = useState<RefundBankAccount>(EMPTY_REFUND_BANK_ACCOUNT);
  const [busy, setBusy] = useState(false);
  const ref = as === "member" ? { as, order_number: orderNumber } : { order_id: orderId };
  const load = useCallback(async () => {
    const { data } = await supabase.functions.invoke("payuni-refund", { body: { ...ref, action: "status" } });
    setRows(data?.ok ? data.rows : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [as, orderId, orderNumber]);
  useEffect(() => { load(); }, [load]);
  if (rows.length === 0) return null;
  const retry = rows.find((r) => r.can_resubmit);

  const resubmit = async () => {
    if (!retry) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("payuni-refund", {
      body: { ...ref, action: "resubmit_bank_account", refund_mer_trade_no: retry.mer_trade_no, bank_account: acct },
    });
    setBusy(false);
    if (error || !data?.ok) { toast.error(data?.error ?? t("booking.member.payuniRefund.failed")); return; }
    toast.success(t("booking.member.payuniRefund.resubmitDone"));
    setAcct(EMPTY_REFUND_BANK_ACCOUNT);
    load();
  };

  return (
    <div className="space-y-2 rounded-md border p-3" data-testid="payuni-refund-status">
      <div className="text-sm font-medium">{t("booking.member.payuniRefund.statusTitle")}</div>
      {rows.map((r) => (
        <div key={r.mer_trade_no} className="flex flex-wrap items-center gap-2 text-sm" data-testid={`payuni-refund-row-${r.mer_trade_no}`}>
          <span className="tabular-nums">NT$ {Number(r.amount).toLocaleString()}</span>
          <Badge variant={r.status === "failed" ? "destructive" : "outline"}>{t(`booking.member.payuniRefund.status.${r.status}`) || r.status}</Badge>
          {r.bank && <span className="text-xs text-muted-foreground">{t("booking.member.payuniRefund.account")} {r.bank.bank_code} {r.bank.account_masked} {r.bank.holder_masked}</span>}
          {r.reason && <span className="w-full text-xs text-muted-foreground">{r.reason}</span>}
        </div>
      ))}
      {retry && (
        <div className="space-y-2 pt-2" data-testid="payuni-refund-resubmit">
          <p className="text-sm text-destructive">{t("booking.member.payuniRefund.resubmitTitle")}</p>
          <RefundBankAccountForm value={acct} onChange={setAcct} testIdPrefix="payuni-refund-resubmit" />
          <Button size="sm" disabled={busy || !isRefundBankAccountValid(acct)} onClick={resubmit} data-testid="payuni-refund-resubmit-btn">
            {t("booking.member.payuniRefund.resubmit")}
          </Button>
        </div>
      )}
    </div>
  );
}
