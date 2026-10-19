import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Input } from "@lakeze/shared/components/ui/input";
import { Textarea } from "@lakeze/shared/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@lakeze/shared/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lakeze/shared/components/ui/table";
import { ITEM_STATUS, UNKNOWN_SEND, itemName, ntd, signed, type FeeBatch, type FeeItem } from "@/lib/payuniPlatformFee";

type Act = (key: string, body: Record<string, unknown>, ok: string) => Promise<void>;
type Edit = { kind: "adjust" | "correction" | "receivable"; item: FeeItem } | null;

/** 平台費明細：每館金額、Ragic 參考與差額（不為 0 標黃）、展開看訂單快照；草稿可調整、失敗可轉應收、已撥款可負向修正 */
export function PlatformFeeItemsTable({ batch, items, busy, onAct }: { batch: FeeBatch; items: FeeItem[]; busy: boolean; onAct: Act }) {
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<Edit>(null);
  const hasCorrection = (acc: string) => items.some((i) => i.accommodation_id === acc && i.bal_type === 2);
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead /><TableHead>館別</TableHead><TableHead className="text-right">訂單數</TableHead><TableHead className="text-right">平台費</TableHead>
          <TableHead className="text-right">Ragic 算法</TableHead><TableHead className="text-right">差額</TableHead><TableHead>狀態</TableHead><TableHead>操作</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {items.map((i) => {
            const diff = i.bal_type === 1 ? i.amount - (i.detail.ragic?.amount ?? 0) : 0;
            const mixed = i.detail.orders?.filter((o) => o.mixed_payment).length ?? 0;
            return (
              <Fragment key={i.id}>
                <TableRow className={diff !== 0 ? "bg-yellow-50 dark:bg-yellow-950/30" : ""} data-testid={`payuni-fee-item-${i.trade_no}`}>
                  <TableCell>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setOpen(open === i.id ? null : i.id)} data-testid={`payuni-fee-expand-${i.trade_no}`}>
                      {open === i.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </TableCell>
                  <TableCell>
                    {itemName(i)}{i.bal_type === 2 && <Badge variant="outline" className="ml-2">負向修正</Badge>}
                    {mixed > 0 && <Badge variant="secondary" className="ml-2">混合付款 {mixed}</Badge>}
                    {(i.detail.prior_unpaid?.length ?? 0) > 0 && <Badge variant="destructive" className="ml-2">前期未收 {i.detail.prior_unpaid!.length}</Badge>}
                  </TableCell>
                  <TableCell className="text-right">{i.detail.orders?.length ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium">{ntd(signed(i))}</TableCell>
                  <TableCell className="text-right">{i.bal_type === 1 ? ntd(i.detail.ragic?.amount) : "—"}</TableCell>
                  <TableCell className={`text-right ${diff !== 0 ? "text-yellow-700 font-medium" : ""}`} data-testid={`payuni-fee-diff-${i.trade_no}`}>{i.bal_type === 1 ? ntd(diff) : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={i.status === "failed" || i.status === "receivable" ? "destructive" : "outline"}>{ITEM_STATUS[i.status] ?? i.status}</Badge>
                    {i.api_message && <div className="text-xs text-muted-foreground">{i.api_status} {i.api_message}</div>}
                  </TableCell>
                  <TableCell className="space-x-1 whitespace-nowrap">
                    {batch.status === "draft" && i.bal_type === 1 && <Button size="sm" variant="outline" onClick={() => setEdit({ kind: "adjust", item: i })} data-testid={`payuni-fee-adjust-${i.trade_no}`}>調整</Button>}
                    {i.status === "failed" && !UNKNOWN_SEND.has(i.api_status ?? "") && <Button size="sm" variant="outline" onClick={() => setEdit({ kind: "receivable", item: i })} data-testid={`payuni-fee-receivable-${i.trade_no}`}>轉應收</Button>}
                    {batch.status === "settled" && i.bal_type === 1 && i.status === "funded" && !hasCorrection(i.accommodation_id) && <Button size="sm" variant="outline" onClick={() => setEdit({ kind: "correction", item: i })} data-testid={`payuni-fee-correction-${i.trade_no}`}>負向修正</Button>}
                    {i.bal_type === 2 && i.status === "pending" && !i.detail.correction?.confirmed_at && <Button size="sm" disabled={busy} onClick={() => onAct("cc", { action: "confirm_correction", item_id: i.id }, "修正已確認")} data-testid={`payuni-fee-confirm-correction-${i.trade_no}`}>確認修正</Button>}
                  </TableCell>
                </TableRow>
                {open === i.id && <TableRow><TableCell colSpan={8}><ItemDetail item={i} /></TableCell></TableRow>}
              </Fragment>
            );
          })}
          {items.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">本批次沒有需扣款的館</TableCell></TableRow>}
        </TableBody>
      </Table>
      <EditDialog edit={edit} onClose={() => setEdit(null)} batchId={batch.id} onAct={onAct} />
    </div>
  );
}

function ItemDetail({ item }: { item: FeeItem }) {
  const d = item.detail;
  return (
    <div className="space-y-2 text-sm" data-testid={`payuni-fee-detail-${item.trade_no}`}>
      {d.correction && <p>修正原因：{d.correction.reason}（{d.correction.created_by}{d.correction.confirmed_by ? `，${d.correction.confirmed_by} 確認` : "，待確認"}）</p>}
      {d.orders && (
        <table className="w-full text-xs"><thead><tr className="text-muted-foreground">
          <th className="text-left">訂單</th><th className="text-left">入住</th><th className="text-right">當月營收</th><th className="text-right">抽成基礎</th><th className="text-right">平台費</th><th />
        </tr></thead><tbody>
          {d.orders.map((o) => (
            <tr key={o.order_id}><td className="font-mono">{o.order_number}</td><td>{o.check_in_date}～{o.check_out_date}</td>
              <td className="text-right">{ntd(o.revenue)}</td><td className="text-right">{ntd(o.base)}</td><td className="text-right">{ntd(o.fee)}</td>
              <td>{o.exempt && "免抽成 "}{o.mixed_payment && <span className="text-yellow-700">混合付款</span>}</td></tr>
          ))}
        </tbody></table>
      )}
      {(d.refunds?.length ?? 0) > 0 && <p data-testid={`payuni-fee-refunds-${item.trade_no}`}>當月 PAYUNi 退款（未回扣，請自行判斷是否調整）：{d.refunds!.map((r) => `${r.order_number ?? "—"} ${ntd(r.amount)}`).join("、")}</p>}
      {(d.prior_unpaid?.length ?? 0) > 0 && <p className="text-destructive">前期未收（不自動加總）：{d.prior_unpaid!.map((p) => `${p.period} ${ntd(p.amount)}（${ITEM_STATUS[p.status] ?? p.status}）`).join("、")}</p>}
      {(d.adjustments?.length ?? 0) > 0 && <p>調整紀錄：{d.adjustments!.map((a) => `${ntd(a.from)} → ${ntd(a.to)}（${a.reason}，${a.by}）`).join("；")}</p>}
      {d.non_payuni_orders != null && <p className="text-muted-foreground">非 PAYUNi 收款訂單 {d.non_payuni_orders} 筆未計入；全月（含非 PAYUNi）月結平台費 {ntd(d.month_fee_all_orders)}</p>}
    </div>
  );
}

const TITLE = { adjust: "調整金額", correction: "負向修正（退回錯扣金額）", receivable: "轉應收（人工向民宿收款）" };

function EditDialog({ edit, onClose, batchId, onAct }: { edit: Edit; onClose: () => void; batchId: string; onAct: Act }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  if (!edit) return null;
  const i = edit.item;
  const needAmt = edit.kind !== "receivable";
  const valid = (!needAmt || /^\d+$/.test(amount)) && (edit.kind === "receivable" || reason.trim() !== "");
  const save = async () => {
    const body = edit.kind === "adjust" ? { action: "adjust", item_id: i.id, amount: Number(amount), reason }
      : edit.kind === "correction" ? { action: "correction", batch_id: batchId, accommodation_id: i.accommodation_id, amount: Number(amount), reason }
      : { action: "receivable", item_id: i.id, note: reason };
    await onAct(edit.kind, body, "已儲存");
    setAmount(""); setReason(""); onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="payuni-fee-edit-dialog">
        <DialogHeader><DialogTitle>{itemName(i)}：{TITLE[edit.kind]}</DialogTitle></DialogHeader>
        {needAmt && <Input inputMode="numeric" placeholder={edit.kind === "adjust" ? `目前 ${i.amount}（填 0 = 本月不扣）` : `最多 ${i.amount}`} value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="payuni-fee-edit-amount" />}
        <Textarea placeholder={edit.kind === "receivable" ? "備註（選填）" : "原因（必填）"} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="payuni-fee-edit-reason" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={save} disabled={!valid} data-testid="payuni-fee-edit-save">儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
