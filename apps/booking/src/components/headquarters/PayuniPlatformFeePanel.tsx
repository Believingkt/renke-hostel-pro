import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Input } from "@lakeze/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@lakeze/shared/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@lakeze/shared/components/ui/alert-dialog";
import { PlatformFeeItemsTable } from "@/components/headquarters/PlatformFeeItemsTable";
import {
  BATCH_STATUS, FEE_NOTICE, callFee, downloadCsv, feeCsv, feeTable, ntd, signed, type FeeBatch, type FeeItem,
} from "@/lib/payuniPlatformFee";

const lastMonth = () => { const d = new Date(Date.now() + 8 * 3_600_000); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };

/** HQ「PAYUNi 金流 → 平台費」：產生草稿 → 核對／調整 → 確認 → 送出（二次確認）→ 查詢撥款結果 */
export function PayuniPlatformFeePanel() {
  const [batches, setBatches] = useState<FeeBatch[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [items, setItems] = useState<FeeItem[]>([]);
  const [period, setPeriod] = useState(lastMonth);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const loadBatches = useCallback(async () => {
    const { data } = await feeTable("payuni_platform_fee_batches").select("*").order("period", { ascending: false }).limit(36);
    const list = (data ?? []) as FeeBatch[];
    setBatches(list);
    setBatchId((cur) => cur ?? list.find((b) => b.status !== "cancelled")?.id ?? null);
  }, []);
  const loadItems = useCallback(async () => {
    if (!batchId) { setItems([]); return; }
    const { data } = await feeTable("payuni_platform_fee_items").select("*").eq("batch_id", batchId);
    setItems(((data ?? []) as FeeItem[]).sort((a, b) => a.trade_no.localeCompare(b.trade_no)));
  }, [batchId]);
  useEffect(() => { loadBatches(); }, [loadBatches]);
  useEffect(() => { loadItems(); }, [loadItems]);

  const batch = batches.find((b) => b.id === batchId) ?? null;
  const live = useMemo(() => items.filter((i) => i.status !== "cancelled"), [items]);
  const sendable = useMemo(() => {
    const correction = batch && ["settled", "submitted", "partial_failed"].includes(batch.status);
    return live.filter((i) => i.status === "pending" && !i.api_status && (correction ? i.bal_type === 2 && i.detail.correction?.confirmed_at : i.bal_type === 1));
  }, [live, batch]);
  const sendTotal = sendable.reduce((s, i) => s + i.amount, 0);

  const act = async (key: string, body: Record<string, unknown>, ok: string) => {
    setBusy(key);
    try {
      const data = await callFee(body);
      toast.success(ok);
      if (data.batch_id) setBatchId(data.batch_id);
      await loadBatches();
      await loadItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const spin = (k: string) => busy === k && <Loader2 className="h-4 w-4 mr-1 animate-spin" />;

  return (
    <div className="space-y-4" data-testid="payuni-fee-panel">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">人客多平台費（多功能收付）</CardTitle>
          <CardDescription>{FEE_NOTICE}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Input type="month" value={period} max={lastMonth()} onChange={(e) => setPeriod(e.target.value)} className="w-40" data-testid="payuni-fee-period" />
          <Button onClick={() => act("draft", { action: "draft", period }, `${period} 草稿已產生`)} disabled={!!busy} data-testid="payuni-fee-draft-btn">
            {spin("draft")}產生草稿
          </Button>
          <span className="mx-2 h-6 w-px bg-border" />
          <Select value={batchId ?? ""} onValueChange={setBatchId}>
            <SelectTrigger className="w-56" data-testid="payuni-fee-batch-select"><SelectValue placeholder="選擇批次" /></SelectTrigger>
            <SelectContent>
              {batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.period}・{BATCH_STATUS[b.status] ?? b.status}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="icon" variant="outline" onClick={() => { loadBatches(); loadItems(); }} data-testid="payuni-fee-reload"><RefreshCw className="h-4 w-4" /></Button>
        </CardContent>
      </Card>
      {batch && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{batch.period}</CardTitle>
              <Badge variant="outline" data-testid="payuni-fee-batch-status">{BATCH_STATUS[batch.status] ?? batch.status}</Badge>
              <span className="text-sm text-muted-foreground" data-testid="payuni-fee-batch-total">{live.length} 筆・合計 {ntd(live.reduce((s, i) => s + signed(i), 0))}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => downloadCsv(`平台費_${batch.period}.csv`, feeCsv(batch.period, live))} data-testid="payuni-fee-csv">
                <Download className="h-4 w-4 mr-1" />匯出 CSV
              </Button>
              {batch.status === "draft" && <Button size="sm" onClick={() => act("confirm", { action: "confirm", batch_id: batch.id }, "已確認，金額已鎖定")} disabled={!!busy} data-testid="payuni-fee-confirm-btn">{spin("confirm")}確認金額</Button>}
              {["draft", "confirmed"].includes(batch.status) && <Button size="sm" variant="outline" onClick={() => act("cancel", { action: "cancel", batch_id: batch.id }, "批次已取消")} disabled={!!busy} data-testid="payuni-fee-cancel-btn">取消批次</Button>}
              {sendable.length > 0 && batch.status !== "draft" && <Button size="sm" variant="destructive" onClick={() => setConfirmSubmit(true)} disabled={!!busy} data-testid="payuni-fee-submit-btn">{spin("submit")}送出扣款</Button>}
              {["submitted", "partial_failed"].includes(batch.status) && <Button size="sm" variant="outline" onClick={() => act("poll", { action: "poll", batch_id: batch.id }, "已查詢撥款結果")} disabled={!!busy} data-testid="payuni-fee-poll-btn">{spin("poll")}查詢撥款結果</Button>}
            </div>
          </CardHeader>
          <CardContent>
            <PlatformFeeItemsTable batch={batch} items={items} busy={!!busy} onAct={act} />
          </CardContent>
        </Card>
      )}
      <AlertDialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
        <AlertDialogContent data-testid="payuni-fee-submit-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>確定送出 {batch?.period} 平台費？</AlertDialogTitle>
            <AlertDialogDescription data-testid="payuni-fee-submit-summary">
              將以 PAYUNi 多功能收付對 {sendable.length} 館{sendable.some((i) => i.bal_type === 2) ? "退回（負向修正）" : "扣款"}，總額 {ntd(sendTotal)}。PAYUNi 次日執行，送出後無法撤回。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => batch && act("submit", { action: "submit", batch_id: batch.id }, "已送出")} data-testid="payuni-fee-submit-confirm">確定送出</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
