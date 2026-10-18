import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@lakeze/shared/integrations/supabase/client";

interface AtmInfo { pay_no: string | null; bank_type: string | null; expire_at: string | null; paid_at: string | null; account5: string | null }
interface RefundInfo { action: string | null; reason: string | null; source: string | null; stale_alerted: boolean }
interface Row { mer_trade_no: string; amount: number; status: string; anomaly: string | null; created_at: string; atm?: AtmInfo; refund?: RefundInfo }
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("zh-TW", { dateStyle: "short", timeStyle: "short" }) : "—");
const ANOMALY_LABEL = (a: string) => (a === "PAID_AFTER_CANCEL" ? "取消後入帳" : a.startsWith("ATM_MISMATCH") ? "ATM 入帳異常" : "金額異常");
const STATUS_LABEL: Record<string, string> = { pending: "待付款", unknown: "確認中", paid: "已付款", failed: "失敗", cancelled: "已取消", expired: "已逾時" };
const REFUND_STATUS_LABEL: Record<string, string> = { pending: "退款處理中", paid: "退款完成", failed: "退款失敗", cancelled: "退款已取消" };
const REFUND_ACTION_LABEL: Record<string, string> = {
  cancel: "取消授權", close_refund: "信用卡退款", offline_refund: "ATM 轉匯退款", pending: "暫緩（待請款）", manual: "人工退款",
};

/** 金流稽核：PAYUNi 金額異常與待確認交易，可逐筆「重新查詢」 */
export function PayuniTxAuditCard({ accommodationId }: { accommodationId: string | null }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!accommodationId) return;
    const { data } = await supabase.functions.invoke("payuni-trade-query", { body: { action: "list", accommodation_id: accommodationId } });
    setRows(data?.ok ? data.rows : []);
  }, [accommodationId]);
  useEffect(() => { load(); }, [load]);
  if (!rows || rows.length === 0) return null;

  const requery = async (merTradeNo: string) => {
    setBusy(merTradeNo);
    const { data, error } = await supabase.functions.invoke("payuni-trade-query", { body: { mer_trade_no: merTradeNo } });
    setBusy(null);
    if (error || !data?.ok) toast.error("查詢失敗，請稍後再試");
    else toast.success(`查詢完成：交易狀態 ${STATUS_LABEL[data.tx_status] ?? data.tx_status}`);
    load();
  };
  return (
    <Card data-testid="payuni-tx-audit-card">
      <CardHeader className="pb-3"><CardTitle className="text-base">PAYUNi 交易待處理／ATM 交易／退款</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => (
          <div key={r.mer_trade_no} className="flex flex-wrap items-center gap-2 text-sm border rounded-md p-2" data-testid={`payuni-tx-row-${r.mer_trade_no}`}>
            <span className="font-mono">{r.mer_trade_no}</span>
            <span>NT$ {Number(r.amount).toLocaleString()}</span>
            <Badge variant={r.refund && r.status === "failed" ? "destructive" : "outline"}>
              {(r.refund ? REFUND_STATUS_LABEL[r.status] : STATUS_LABEL[r.status]) ?? r.status}
            </Badge>
            {r.refund && (
              <span className="text-xs text-muted-foreground" data-testid={`payuni-refund-info-${r.mer_trade_no}`}>
                {REFUND_ACTION_LABEL[r.refund.action ?? ""] ?? "退款"}
                {r.refund.source === "payuni_backstage" ? "・PAYUNi 後台退款補登" : ""}
                {r.refund.reason ? `・${r.refund.reason}` : ""}
                {r.refund.stale_alerted ? "・已逾 7 天告警" : ""}
              </span>
            )}
            {r.anomaly && <Badge variant="destructive" data-testid={`payuni-anomaly-${r.mer_trade_no}`}>{ANOMALY_LABEL(r.anomaly)}</Badge>}
            {r.atm && (
              <span className="text-xs text-muted-foreground" data-testid={`payuni-atm-info-${r.mer_trade_no}`}>
                ATM {r.atm.bank_type ?? ""} {r.atm.pay_no ?? "—"}・截止 {fmt(r.atm.expire_at)}{r.atm.paid_at ? `・付款 ${fmt(r.atm.paid_at)}` : ""}{r.atm.account5 ? `・帳號末五碼 ${r.atm.account5}` : ""}
              </span>
            )}
            {!r.refund && <Button size="sm" variant="outline" className="ml-auto" disabled={busy === r.mer_trade_no}
              onClick={() => requery(r.mer_trade_no)} data-testid={`payuni-tx-requery-${r.mer_trade_no}`}>
              {busy === r.mer_trade_no ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}重新查詢
            </Button>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
