import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, History } from "lucide-react";
import { toast } from "sonner";

export interface AuditActionRow {
  id: string;
  charge_id: string;
  order_number: string | null;
  rec_trade_id: string | null;
  charge_action: string | null;
  resolution_action: string;
  final_status: string | null;
  recorded_amount: number | null;
  verified_amount: number | null;
  tappay_amount: number | null;
  amount_matches: boolean | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  note: string | null;
  operator_email: string | null;
  created_at: string;
}

const RESOLUTION_LABELS: Record<string, string> = {
  dismiss: "無需處理，直接結案",
  resolve_success: "確認為成功並回寫",
  resolve_failed: "確認為失敗",
};

const CHARGE_ACTION_LABELS: Record<string, string> = {
  card_bind: "綁卡",
  room_charge: "入住扣款",
  cancellation_fee: "取消手續費",
  refund: "退款",
  deposit: "押金扣款",
};

const fmtMoney = (v: number | null | undefined) =>
  v == null ? "—" : `NT$ ${Number(v).toLocaleString()}`;

const stateSummary = (s: Record<string, unknown> | null) => {
  if (!s) return "—";
  const parts: string[] = [];
  if (s.charge_status) parts.push(`狀態 ${s.charge_status}`);
  if (s.charge_amount != null) parts.push(`金額 ${Number(s.charge_amount).toLocaleString()}`);
  if (s.order_payment_status) parts.push(`付款 ${s.order_payment_status}`);
  if (s.order_room_charge_status) parts.push(`扣款 ${s.order_room_charge_status}`);
  if (s.needs_manual_review != null) parts.push(s.needs_manual_review ? "待人工" : "已結案");
  return parts.join("｜") || "—";
};

interface Props {
  accommodationId: string | null;
  reloadKey: number;
}

export function PaymentAuditActionLog({ accommodationId, reloadKey }: Props) {
  const [rows, setRows] = useState<AuditActionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    if (!accommodationId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("payment_audit_actions")
        .select(
          "id, charge_id, order_number, rec_trade_id, charge_action, resolution_action, final_status, recorded_amount, verified_amount, tappay_amount, amount_matches, before_state, after_state, note, operator_email, created_at",
        )
        .eq("accommodation_id", accommodationId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) toast.error(`操作紀錄載入失敗：${error.message}`);
      setRows((data as unknown as AuditActionRow[]) || []);
      setLoading(false);
    })();
  }, [accommodationId, reloadKey]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter(
      (r) =>
        (r.order_number || "").toLowerCase().includes(kw) ||
        (r.operator_email || "").toLowerCase().includes(kw) ||
        (r.rec_trade_id || "").toLowerCase().includes(kw),
    );
  }, [rows, keyword]);

  const downloadCsv = () => {
    const header = [
      "處理時間",
      "操作者",
      "訂單編號",
      "交易編號",
      "事件類型",
      "處理選項",
      "最終狀態",
      "系統金額",
      "金流金額",
      "回寫金額",
      "金額是否相符",
      "處理前狀態",
      "處理後狀態",
      "備註",
    ];
    const lines = filtered.map((r) => [
      new Date(r.created_at).toLocaleString("zh-TW"),
      r.operator_email || "",
      r.order_number || "",
      r.rec_trade_id || "",
      CHARGE_ACTION_LABELS[r.charge_action || ""] || r.charge_action || "",
      RESOLUTION_LABELS[r.resolution_action] || r.resolution_action,
      r.final_status || "",
      r.recorded_amount ?? "",
      r.tappay_amount ?? "",
      r.verified_amount ?? "",
      r.amount_matches == null ? "未核對" : r.amount_matches ? "相符" : "不符",
      stateSummary(r.before_state),
      stateSummary(r.after_state),
      (r.note || "").replace(/\n/g, " "),
    ]);
    const csv = [header, ...lines]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `金流稽核操作紀錄_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" /> 人工處理操作紀錄
          <Badge variant="secondary">{filtered.length}</Badge>
        </CardTitle>
        <div className="flex items-center gap-2">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜尋訂單／操作者／交易編號"
            className="w-56"
          />
          <Button variant="outline" size="sm" onClick={downloadCsv} disabled={!filtered.length}>
            <Download className="h-4 w-4 mr-1" /> 下載紀錄
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">處理時間</TableHead>
              <TableHead className="whitespace-nowrap">操作者</TableHead>
              <TableHead className="whitespace-nowrap">訂單</TableHead>
              <TableHead className="whitespace-nowrap">事件</TableHead>
              <TableHead className="whitespace-nowrap">處理選項</TableHead>
              <TableHead className="whitespace-nowrap text-right">金額（系統／金流／回寫）</TableHead>
              <TableHead className="whitespace-nowrap">處理前</TableHead>
              <TableHead className="whitespace-nowrap">處理後</TableHead>
              <TableHead className="whitespace-nowrap">備註</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                  載入中…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                  尚無人工處理紀錄
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString("zh-TW")}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{r.operator_email || "系統"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div>{r.order_number || "—"}</div>
                    <div className="text-muted-foreground">{r.rec_trade_id || ""}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {CHARGE_ACTION_LABELS[r.charge_action || ""] || r.charge_action || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge
                      variant={
                        r.resolution_action === "resolve_success"
                          ? "secondary"
                          : r.resolution_action === "resolve_failed"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {RESOLUTION_LABELS[r.resolution_action] || r.resolution_action}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {fmtMoney(r.recorded_amount)} / {fmtMoney(r.tappay_amount)} / {fmtMoney(r.verified_amount)}
                    {r.amount_matches === false && (
                      <span className="ml-1 text-destructive">不符</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={stateSummary(r.before_state)}>
                    {stateSummary(r.before_state)}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={stateSummary(r.after_state)}>
                    {stateSummary(r.after_state)}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate" title={r.note || ""}>
                    {r.note || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
