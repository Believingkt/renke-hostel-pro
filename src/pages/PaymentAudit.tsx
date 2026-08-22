import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AdminPageShell,
  AdminToolbar,
  ResponsiveDataView,
  type ResponsiveColumn,
} from "@/components/admin";
import { Download, Receipt, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { PaymentAuditResolveDialog, type ResolveTarget } from "@/components/admin/PaymentAuditResolveDialog";
import { PaymentAuditActionLog } from "@/components/admin/PaymentAuditActionLog";



interface ChargeRow {
  id: string;
  order_id: string;
  action: string;
  amount: number;
  status: string;
  trigger_source: string;
  rec_trade_id: string | null;
  bank_transaction_id: string | null;
  webhook_status: string | null;
  needs_manual_review: boolean;
  resolved_at: string | null;
  resolution_note: string | null;
  error_message: string | null;
  created_at: string;
  orders?: {
    order_number: string;
    guest_name: string | null;
    check_in_date: string;
    final_price: number;
    paid_amount: number;
    refunded_amount: number | null;
    cancellation_fee_amount: number | null;
    cancellation_fee_percent: number | null;
    order_status: string;
    payment_status: string;
    room_charge_status: string | null;
  } | null;
}

const ACTION_LABELS: Record<string, string> = {
  card_bind: "綁卡",
  room_charge: "入住扣款",
  cancellation_fee: "取消手續費",
  refund: "退款",
  deposit: "押金扣款",
};

const STATUS_LABELS: Record<string, string> = {
  success: "成功",
  failed: "失敗",
  pending: "處理中",
};

const WEBHOOK_LABELS: Record<string, string> = {
  pending: "等待金流回報",
  confirmed: "金流已確認",
  failed: "金流回報失敗",
  "n/a": "不適用",
};

export default function PaymentAudit() {
  const { currentAccommodationId } = useAccommodation();
  const [rows, setRows] = useState<ChargeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [resolveTarget, setResolveTarget] = useState<ResolveTarget | null>(null);


  useEffect(() => {
    if (!currentAccommodationId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("deposit_charges")
        .select(
          "id, order_id, action, amount, status, trigger_source, rec_trade_id, bank_transaction_id, webhook_status, needs_manual_review, resolved_at, resolution_note, error_message, created_at, orders!inner(order_number, guest_name, check_in_date, final_price, paid_amount, refunded_amount, cancellation_fee_amount, cancellation_fee_percent, order_status, payment_status, room_charge_status)",
        )
        .eq("accommodation_id", currentAccommodationId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) toast.error(`載入失敗：${error.message}`);
      setRows((data as unknown as ChargeRow[]) || []);
      setLoading(false);
    })();
  }, [currentAccommodationId, reloadKey]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (actionFilter !== "all" && r.action !== actionFilter) return false;
      if (statusFilter === "review" && !r.needs_manual_review) return false;
      if (statusFilter !== "all" && statusFilter !== "review" && r.status !== statusFilter) return false;
      if (!kw) return true;
      return (
        (r.orders?.order_number || "").toLowerCase().includes(kw) ||
        (r.orders?.guest_name || "").toLowerCase().includes(kw) ||
        (r.rec_trade_id || "").toLowerCase().includes(kw)
      );
    });
  }, [rows, actionFilter, statusFilter, keyword]);

  const pendingReview = rows.filter((r) => r.needs_manual_review && !r.resolved_at).length;

  const openResolve = (row: ChargeRow) => {
    setResolveTarget({
      id: row.id,
      action: row.action,
      amount: row.amount,
      rec_trade_id: row.rec_trade_id,
      error_message: row.error_message,
      orderNumber: row.orders?.order_number ?? null,
      guestName: row.orders?.guest_name ?? null,
    });
  };


  const downloadCsv = () => {
    const header = [
      "時間",
      "訂單編號",
      "旅客",
      "入住日",
      "事件",
      "金額",
      "狀態",
      "觸發來源",
      "金流回報",
      "TapPay交易編號",
      "銀行交易編號",
      "取消比例%",
      "取消手續費",
      "已退款",
      "訂單狀態",
      "付款狀態",
      "需人工處理",
      "錯誤訊息",
    ];
    const lines = filtered.map((r) => [
      new Date(r.created_at).toLocaleString("zh-TW"),
      r.orders?.order_number ?? "",
      r.orders?.guest_name ?? "",
      r.orders?.check_in_date ?? "",
      ACTION_LABELS[r.action] ?? r.action,
      r.amount,
      STATUS_LABELS[r.status] ?? r.status,
      r.trigger_source,
      WEBHOOK_LABELS[r.webhook_status ?? ""] ?? r.webhook_status ?? "",
      r.rec_trade_id ?? "",
      r.bank_transaction_id ?? "",
      r.orders?.cancellation_fee_percent ?? "",
      r.orders?.cancellation_fee_amount ?? "",
      r.orders?.refunded_amount ?? "",
      r.orders?.order_status ?? "",
      r.orders?.payment_status ?? "",
      r.needs_manual_review ? "是" : "否",
      (r.error_message ?? "").replace(/[\r\n,]/g, " "),
    ]);
    const csv = [header, ...lines]
      .map((cols) => cols.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payment-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: ResponsiveColumn<ChargeRow>[] = [
    {
      key: "time",
      header: "時間",
      className: "text-xs whitespace-nowrap",
      cell: (r) => new Date(r.created_at).toLocaleString("zh-TW"),
    },
    {
      key: "order",
      header: "訂單",
      className: "text-xs whitespace-nowrap",
      cell: (r) => (
        <>
          <div className="font-medium">{r.orders?.order_number}</div>
          <div className="text-muted-foreground">
            {r.orders?.guest_name} · 入住 {r.orders?.check_in_date}
          </div>
        </>
      ),
    },
    {
      key: "action",
      header: "事件",
      className: "text-xs whitespace-nowrap",
      cell: (r) => (
        <>
          {ACTION_LABELS[r.action] ?? r.action}
          <div className="text-muted-foreground">{r.trigger_source}</div>
        </>
      ),
    },
    {
      key: "amount",
      header: "金額",
      align: "right",
      className: "text-xs whitespace-nowrap",
      cell: (r) => `NT$ ${Number(r.amount || 0).toLocaleString()}`,
    },
    {
      key: "status",
      header: "狀態",
      className: "text-xs whitespace-nowrap",
      cell: (r) => (
        <>
          <Badge variant={r.status === "success" ? "secondary" : "destructive"}>
            {STATUS_LABELS[r.status] ?? r.status}
          </Badge>
          {r.error_message && (
            <div className="text-destructive mt-1 max-w-[180px] truncate" title={r.error_message}>
              {r.error_message}
            </div>
          )}
        </>
      ),
    },
    {
      key: "webhook",
      header: "金流回報",
      className: "text-xs whitespace-nowrap",
      cell: (r) => WEBHOOK_LABELS[r.webhook_status ?? ""] ?? r.webhook_status ?? "—",
    },
    {
      key: "fee",
      header: "手續費計算",
      className: "text-xs whitespace-nowrap",
      cell: (r) =>
        r.orders?.cancellation_fee_percent != null ? (
          <>
            <div>級距 {r.orders.cancellation_fee_percent}%</div>
            <div className="text-muted-foreground tabular-nums">
              手續費 NT$ {Number(r.orders.cancellation_fee_amount || 0).toLocaleString()} ／ 已退 NT${" "}
              {Number(r.orders.refunded_amount || 0).toLocaleString()}
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "trade",
      header: "交易編號",
      className: "text-xs whitespace-nowrap",
      cell: (r) => (
        <>
          <div>{r.rec_trade_id || "—"}</div>
          {r.bank_transaction_id && (
            <div className="text-muted-foreground">{r.bank_transaction_id}</div>
          )}
        </>
      ),
    },
    {
      key: "resolve",
      header: "處理",
      className: "text-xs whitespace-nowrap",
      cell: (r) =>
        r.needs_manual_review ? (
          <Button size="sm" variant="outline" onClick={() => openResolve(r)}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> 一鍵核對處理
          </Button>
        ) : r.resolved_at ? (
          <span className="text-muted-foreground">
            已於 {new Date(r.resolved_at).toLocaleDateString("zh-TW")} 處理
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <AdminPageShell
      header={
        <AdminPageHeader
          title="金流稽核紀錄"
          description="綁卡、入住扣款、取消手續費與退款的完整流水，可下載供客服查核"
          icon={Receipt}
        />
      }
      spacing="tight"
    >
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            篩選
            {pendingReview > 0 && (
              <Badge variant="destructive">{pendingReview} 筆待人工處理</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AdminToolbar
            filters={
              <>
                <Input
                  placeholder="搜尋訂單編號／旅客／交易編號"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="w-full sm:w-64"
                />
                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部事件</SelectItem>
                    {Object.entries(ACTION_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部狀態</SelectItem>
                    <SelectItem value="success">成功</SelectItem>
                    <SelectItem value="failed">失敗</SelectItem>
                    <SelectItem value="review">待人工處理</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
            secondaryActions={[
              {
                key: "reload",
                label: "重新整理",
                icon: <RefreshCw className="h-4 w-4 mr-1" />,
                onClick: () => setReloadKey((k) => k + 1),
              },
            ]}
            primaryAction={
              <Button onClick={downloadCsv} disabled={filtered.length === 0}>
                <Download className="h-4 w-4 mr-1" /> 下載 CSV
              </Button>
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 md:p-0">
          <div className="p-3 md:p-0">
            <ResponsiveDataView
              rows={filtered}
              columns={columns}
              rowKey={(r) => r.id}
              loading={loading}
              empty="尚無金流事件紀錄"
              rowClassName={(r) => (r.needs_manual_review ? "bg-destructive/5" : undefined)}
              mobileCard={{
                title: (r) => r.orders?.order_number ?? "—",
                subtitle: (r) => (
                  <>
                    {ACTION_LABELS[r.action] ?? r.action} · {new Date(r.created_at).toLocaleString("zh-TW")}
                  </>
                ),
                status: (r) => (
                  <Badge variant={r.status === "success" ? "secondary" : "destructive"}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                ),
                fields: (r) => [
                  { label: "金額", value: `NT$ ${Number(r.amount || 0).toLocaleString()}` },
                  { label: "旅客／入住", value: `${r.orders?.guest_name ?? "—"} · ${r.orders?.check_in_date ?? "—"}` },
                  { label: "金流回報", value: WEBHOOK_LABELS[r.webhook_status ?? ""] ?? r.webhook_status ?? "—" },
                  { label: "交易編號", value: r.rec_trade_id || "—" },
                  ...(r.orders?.cancellation_fee_percent != null
                    ? [
                        {
                          label: "手續費",
                          value: `級距 ${r.orders.cancellation_fee_percent}% ／ NT$ ${Number(
                            r.orders.cancellation_fee_amount || 0,
                          ).toLocaleString()}`,
                        },
                      ]
                    : []),
                  ...(r.error_message ? [{ label: "錯誤", value: r.error_message }] : []),
                ],
                footer: (r) =>
                  r.needs_manual_review ? (
                    <Button size="sm" variant="outline" className="w-full admin-touch-target" onClick={() => openResolve(r)}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> 一鍵核對處理
                    </Button>
                  ) : r.resolved_at ? (
                    <span className="text-xs text-muted-foreground">
                      已於 {new Date(r.resolved_at).toLocaleDateString("zh-TW")} 處理
                    </span>
                  ) : null,
              }}
            />
          </div>
        </CardContent>
      </Card>

      <PaymentAuditActionLog accommodationId={currentAccommodationId} reloadKey={reloadKey} />

      <PaymentAuditResolveDialog
        target={resolveTarget}
        onOpenChange={(open) => !open && setResolveTarget(null)}
        onDone={() => setReloadKey((k) => k + 1)}
      />
    </AdminPageShell>
  );
}
