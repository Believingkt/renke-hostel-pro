import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Mail, RefreshCcw, History } from "lucide-react";

interface Props {
  orderId: string;
  orderNumber?: string;
  canManage?: boolean;
}

type PaymentEvent = {
  id: string;
  from_status: string | null;
  to_status: string;
  paid_amount: number | null;
  final_price: number | null;
  source: string;
  notes: string | null;
  created_at: string;
};

type EmailEvent = {
  id: string;
  email_type: string;
  recipient: string;
  subject: string | null;
  status: string;
  resend_id: string | null;
  error_message: string | null;
  triggered_by: string | null;
  trigger_source: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  unpaid: "未付款",
  pending_payment: "待付款",
  deposit_paid: "已付訂金",
  partial: "部分付款",
  paid: "已付清",
  refunded: "已退款",
  cancelled: "已取消",
};

const EMAIL_TYPE_LABEL: Record<string, string> = {
  booking_confirmation: "訂房確認通知",
  deposit_received: "訂金已收到",
  final_payment_received: "尾款已收到",
  order_cancelled: "訂單取消通知",
};

const EMAIL_STATUS_LABEL: Record<string, string> = {
  sent: "已寄出",
  failed: "寄送失敗",
  resent: "已重送",
  pending: "寄送中",
};

const TRIGGER_SOURCE_LABEL: Record<string, string> = {
  manual_resend: "手動重送",
  auto_final_payment: "系統自動（付款）",
  auto_deposit: "系統自動（訂金入帳）",
  date_change: "改期重寄",
  member_cancel: "會員自行取消",
  atm_notify: "ATM 入帳通知",
};

const EMAIL_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  sent: "default",
  failed: "destructive",
  resent: "outline",
};

type ResendType = "booking_confirmation" | "deposit_received" | "final_payment_received";


export default function OrderNotificationHistory({ orderId, orderNumber, canManage = false }: Props) {
  const [payments, setPayments] = useState<PaymentEvent[]>([]);
  const [emails, setEmails] = useState<EmailEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [resendingType, setResendingType] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, e] = await Promise.all([
      supabase
        .from("payment_status_history")
        .select("id, from_status, to_status, paid_amount, final_price, source, notes, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false }),
      supabase
        .from("booking_email_log")
        .select("id, email_type, recipient, subject, status, resend_id, error_message, triggered_by, trigger_source, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false }),
    ]);
    setPayments((p.data ?? []) as PaymentEvent[]);
    setEmails((e.data ?? []) as EmailEvent[]);
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const resend = async (emailType: ResendType) => {
    setResendingType(emailType);
    try {
      const { data, error } = await supabase.functions.invoke("admin-resend-booking-email", {
        body: { orderId, emailType },
      });
      if (error) throw error;
      if ((data as any)?.success === false || (data as any)?.error) {
        throw new Error((data as any)?.error || "寄送失敗");
      }
      toast.success(`${EMAIL_TYPE_LABEL[emailType]} 已重新寄出`);
      await load();
    } catch (err: any) {
      toast.error(`重送失敗：${err?.message || "unknown"}`);
    } finally {
      setResendingType(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            通知與付款紀錄
            {orderNumber && <span className="text-xs text-muted-foreground font-normal">#{orderNumber}</span>}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            {canManage && (
              <>
                <ResendButton
                  label="重送訂房確認"
                  emailType="booking_confirmation"
                  loading={resendingType === "booking_confirmation"}
                  onConfirm={() => resend("booking_confirmation")}
                />
                <ResendButton
                  label="重送訂金通知"
                  emailType="deposit_received"
                  loading={resendingType === "deposit_received"}
                  onConfirm={() => resend("deposit_received")}
                />
                <ResendButton
                  label="重送尾款通知"
                  emailType="final_payment_received"
                  loading={resendingType === "final_payment_received"}
                  onConfirm={() => resend("final_payment_received")}
                />
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email log */}
        <section>
          <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" /> 通知信件
          </div>
          {loading ? (
            <div className="text-sm text-muted-foreground py-3 flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> 載入中…
            </div>
          ) : emails.length === 0 ? (
            <div className="text-sm text-muted-foreground py-3">尚無寄送紀錄</div>
          ) : (
            <ul className="space-y-2">
              {emails.map((e) => (
                <li key={e.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={EMAIL_STATUS_VARIANT[e.status] || "secondary"}>
                        {EMAIL_STATUS_LABEL[e.status] || e.status}
                      </Badge>
                      <span className="font-medium">{EMAIL_TYPE_LABEL[e.email_type] || e.email_type}</span>
                      {e.trigger_source && (
                        <span className="text-xs text-muted-foreground">
                          ({TRIGGER_SOURCE_LABEL[e.trigger_source] || e.trigger_source})
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(e.created_at), "yyyy-MM-dd HH:mm:ss")}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground break-all">
                    收件人：{e.recipient}
                  </div>
                  {e.error_message && (
                    <div className="mt-1 text-xs text-destructive break-all">錯誤：{e.error_message}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Payment status history */}
        <section>
          <div className="text-sm font-semibold mb-2">付款狀態變更</div>
          {loading ? null : payments.length === 0 ? (
            <div className="text-sm text-muted-foreground py-3">尚無狀態變更</div>
          ) : (
            <ul className="space-y-2">
              {payments.map((p) => (
                <li key={p.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {STATUS_LABEL[p.from_status || ""] || p.from_status || "—"}
                      </span>
                      <span>→</span>
                      <Badge>{STATUS_LABEL[p.to_status] || p.to_status}</Badge>
                      <span className="text-xs text-muted-foreground">({p.source})</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(p.created_at), "yyyy-MM-dd HH:mm:ss")}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    已付 NT${(p.paid_amount || 0).toLocaleString()} / 總額 NT${(p.final_price || 0).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function ResendButton({
  label, emailType, loading, onConfirm,
}: { label: string; emailType: string; loading: boolean; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Mail className="h-3.5 w-3.5 mr-1" />}
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>確認重送 {label}？</AlertDialogTitle>
          <AlertDialogDescription>
            將重新寄送 <strong>{EMAIL_TYPE_LABEL[emailType] || emailType}</strong> 給訂單客人。此動作不會影響付款流程。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>確認寄送</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
