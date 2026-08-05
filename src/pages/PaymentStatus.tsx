/**
 * /payment-status — 結帳後付款狀態追蹤頁
 * 以訂單編號查詢（走 get-public-order Edge Function，不受 orders RLS 限制），
 * 顯示「已綁卡 / 已扣款 / 失敗」並自動輪詢更新。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, CreditCard, FileText, Loader2, RefreshCw, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseFunctionInvokeError } from "@/utils/parseFunctionError";

const POLL_INTERVAL_MS = 8000;

type PublicOrder = {
  id: string;
  order_number: string;
  accommodation_id: string;
  check_in_date: string;
  check_out_date: string;
  guest_name: string | null;
  final_price: number | null;
  paid_amount: number | null;
  payment_status: string | null;
  order_status: string | null;
  payment_method: string | null;
  room_charge_status: string | null;
  room_charge_at: string | null;
  room_charge_error: string | null;
  room_charge_scheduled_date: string | null;
};

type StatusKind = "charged" | "card_bound" | "failed" | "pending" | "cancelled";

function resolveStatus(order: PublicOrder): {
  kind: StatusKind;
  label: string;
  detail: string;
} {
  if (order.order_status === "cancelled") {
    return { kind: "cancelled", label: "訂單已取消", detail: "此訂單已取消，不會再進行扣款。" };
  }
  if (order.room_charge_status === "charged" || order.payment_status === "paid") {
    return {
      kind: "charged",
      label: "已扣款",
      detail: order.room_charge_at
        ? `扣款完成時間：${new Date(order.room_charge_at).toLocaleString("zh-TW")}`
        : "款項已完成收取。",
    };
  }
  if (order.room_charge_status === "failed") {
    return {
      kind: "failed",
      label: "扣款失敗",
      detail: order.room_charge_error || "自動扣款失敗，請聯繫客服或於現場改以其他方式付款。",
    };
  }
  if (order.room_charge_status === "card_bound") {
    return {
      kind: "card_bound",
      label: "已綁卡",
      detail: order.room_charge_scheduled_date
        ? `尚未扣款，系統將於入住當天 ${order.room_charge_scheduled_date} 自動扣款。`
        : "尚未扣款，系統將於入住當天自動扣款。",
    };
  }
  return { kind: "pending", label: "待付款", detail: "尚未完成付款，請依訂單指示完成付款流程。" };
}

const STATUS_STYLE: Record<StatusKind, string> = {
  charged: "bg-primary/10 text-primary border-primary/30",
  card_bound: "bg-secondary text-secondary-foreground border-border",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  pending: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-muted text-muted-foreground border-border",
};

function StatusIcon({ kind }: { kind: StatusKind }) {
  if (kind === "charged") return <CheckCircle2 className="h-6 w-6 text-primary" />;
  if (kind === "failed") return <XCircle className="h-6 w-6 text-destructive" />;
  if (kind === "card_bound") return <CreditCard className="h-6 w-6 text-foreground" />;
  return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />;
}

export default function PaymentStatus() {
  const [params, setParams] = useSearchParams();
  const orderNumber = (params.get("order") || params.get("order_number") || "").trim();
  const accommodationId = params.get("acc") || undefined;

  const [input, setInput] = useState(orderNumber);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [accName, setAccName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<number | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelEmail, setCancelEmail] = useState("");
  const [cancelPhone, setCancelPhone] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const fetchOrder = useCallback(
    async (silent = false) => {
      if (!orderNumber) return;
      if (!silent) setLoading(true);
      try {
        const { data, error: fnError } = await supabase.functions.invoke("get-public-order", {
          body: { order_number: orderNumber, accommodation_id: accommodationId },
        });
        if (fnError) throw fnError;
        if (!data?.order) throw new Error("查無此訂單編號");
        setOrder(data.order as PublicOrder);
        setAccName(data.accommodation_name || "");
        setError(null);
        setLastUpdated(new Date());
      } catch (e: any) {
        setError(e?.message === "查無此訂單編號" ? e.message : "查無此訂單，請確認訂單編號是否正確");
      } finally {
        setLoading(false);
      }
    },
    [orderNumber, accommodationId],
  );

  useEffect(() => {
    setInput(orderNumber);
    setOrder(null);
    if (orderNumber) fetchOrder();
  }, [orderNumber, fetchOrder]);

  // 只有在尚未定案（待付款／已綁卡）時才持續輪詢
  const status = order ? resolveStatus(order) : null;
  const shouldPoll = status?.kind === "pending" || status?.kind === "card_bound";

  useEffect(() => {
    if (!shouldPoll) return;
    timerRef.current = window.setInterval(() => fetchOrder(true), POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [shouldPoll, fetchOrder]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Link to="/" aria-label="返回" className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-base font-bold text-foreground">付款狀態查詢</h1>
      </header>

      <main className="mx-auto max-w-xl px-4 py-6 space-y-4">
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              placeholder="請輸入訂單編號"
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim()) setParams({ order: input.trim() });
              }}
            />
            <Button onClick={() => input.trim() && setParams({ order: input.trim() })} disabled={!input.trim()}>
              查詢
            </Button>
          </CardContent>
        </Card>

        {loading && !order && (
          <p className="py-10 text-center text-sm text-muted-foreground">查詢中…</p>
        )}

        {error && !order && (
          <p className="py-10 text-center text-sm text-destructive">{error}</p>
        )}

        {order && status && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start gap-3">
                <StatusIcon kind={status.kind} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold text-foreground">{status.label}</span>
                    <Badge variant="outline" className={STATUS_STYLE[status.kind]}>
                      訂單 {order.order_number}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{status.detail}</p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">住宿</dt>
                  <dd className="font-medium text-foreground">{accName || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">訂房人</dt>
                  <dd className="font-medium text-foreground">{order.guest_name || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">入住 / 退房</dt>
                  <dd className="font-medium text-foreground">
                    {order.check_in_date} → {order.check_out_date}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">付款方式</dt>
                  <dd className="font-medium text-foreground">{order.payment_method || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">應付金額</dt>
                  <dd className="font-semibold tabular-nums text-foreground">
                    NT$ {(order.final_price || 0).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">已付金額</dt>
                  <dd className="font-semibold tabular-nums text-primary">
                    NT$ {(order.paid_amount || 0).toLocaleString()}
                  </dd>
                </div>
              </dl>

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {shouldPoll ? "狀態每 8 秒自動更新" : "狀態已確認，停止自動更新"}
                  {lastUpdated ? `・最後更新 ${lastUpdated.toLocaleTimeString("zh-TW")}` : ""}
                </p>
                <Button variant="outline" size="sm" onClick={() => fetchOrder()} disabled={loading}>
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                  重新整理
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
