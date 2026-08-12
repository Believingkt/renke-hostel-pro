import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Clock, Loader2, MailCheck, MapPin } from "lucide-react";

const twd = (n: number) => `NT$ ${Math.round(n || 0).toLocaleString("en-US")}`;

type MailState = "sent" | "failed" | "pending";

function MailRow({ label, state, note }: { label: string; state: MailState; note?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-2 last:border-b-0">
      <div>
        <p className="font-medium text-foreground">{label}</p>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      {state === "sent" ? (
        <Badge className="bg-primary shrink-0">
          <MailCheck className="mr-1 h-3.5 w-3.5" /> 已寄出
        </Badge>
      ) : state === "failed" ? (
        <Badge variant="destructive" className="shrink-0">
          <AlertTriangle className="mr-1 h-3.5 w-3.5" /> 寄送失敗
        </Badge>
      ) : (
        <Badge variant="outline" className="shrink-0">
          <Clock className="mr-1 h-3.5 w-3.5" /> 待寄送
        </Badge>
      )}
    </div>
  );
}

export default function GroupBuyOrderConfirmation() {
  const { orderNumber = "" } = useParams<{ orderNumber: string }>();
  const location = useLocation();
  const state = (location.state ?? {}) as { phoneLast4?: string; result?: any };

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const phoneLast4 = (state.phoneLast4 ?? "").replace(/\D/g, "").slice(-4);
    if (!orderNumber || phoneLast4.length !== 4) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data: res } = await supabase.functions.invoke("group-buy-order-lookup", {
        body: { orderNumber, phoneLast4, action: "lookup" },
      });
      if (res && !(res as any).error) setData(res);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber]);

  const result = state.result ?? null;
  const order = data?.order ?? null;
  const emails: any[] = data?.emails ?? [];
  const lastBookingMail = emails[0] ?? null;
  const bookingMailState: MailState = lastBookingMail
    ? lastBookingMail.status
    : result
      ? (result.emailSent ? "sent" : "failed")
      : "pending";
  const confirmed = (data?.events ?? []).some((e: any) => e.event_type === "admin_confirmed");
  const depositMailState: MailState = confirmed
    ? (emails.some((e) => e.status === "sent" && String(e.note ?? "").includes("訂金確認信")) ? "sent" : "failed")
    : "pending";

  const bank = data?.bank ?? result?.bank ?? null;
  const total = order?.total ?? result?.total ?? 0;
  const deposit = order?.deposit ?? result?.deposit ?? 0;
  const balance = order?.balance ?? result?.balance ?? 0;
  const deadlineText = order?.paymentDeadlineText ?? result?.paymentDeadlineText ?? null;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 pb-24">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <CheckCircle2 className="h-5 w-5" /> 訂房已成立，請完成訂金匯款
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-lg bg-muted p-4">
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">訂單編號</span>
              <span className="font-semibold">{orderNumber}</span>
            </div>
            {order && (
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">入住 / 退房</span>
                <span>{order.checkInDate} → {order.checkOutDate}</span>
              </div>
            )}
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">訂單總額</span>
              <span>{twd(total)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">應付訂金</span>
              <span className="font-semibold text-primary">{twd(deposit)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">入住現場付清</span>
              <span>{twd(balance)}</span>
            </div>
            {deadlineText && (
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">匯款期限</span>
                <span className="font-semibold">{deadlineText}</span>
              </div>
            )}
          </div>

          <div className="rounded-lg border p-4">
            <p className="mb-1 font-semibold text-foreground">通知信狀態</p>
            <MailRow
              label="訂房通知＋匯款資訊信"
              state={bookingMailState}
              note={lastBookingMail?.note ?? (result ? undefined : "尚無寄送紀錄")}
            />
            <MailRow
              label="訂金確認信"
              state={depositMailState}
              note={confirmed ? undefined : "民宿確認收到訂金後寄出"}
            />
            {bookingMailState === "failed" && (
              <p className="mt-2 text-xs text-destructive">
                通知信寄送失敗，請直接依下方匯款資訊完成匯款，或與我們聯繫。
              </p>
            )}
          </div>

          {data?.venue && (
            <div className="rounded-lg border p-4">
              <p className="mb-1 font-semibold text-foreground">住宿資訊</p>
              <p>{data.venue.name}</p>
              {data.venue.address && (
                <p className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> {data.venue.address}
                </p>
              )}
              {data.venue.phone && <p className="text-muted-foreground">電話：{data.venue.phone}</p>}
            </div>
          )}

          {bank && (
            <div className="rounded-lg border p-4">
              <p className="mb-2 font-semibold text-foreground">匯款資訊</p>
              <p>
                {bank.bankName}
                {bank.bankCode ? `（${bank.bankCode}）` : ""}
                {bank.branchName ? ` ${bank.branchName}` : ""}
              </p>
              <p>戶名：{bank.accountName}</p>
              <p className="font-semibold">帳號：{bank.accountNumber}</p>
              {bank.note && <p className="text-muted-foreground">{bank.note}</p>}
            </div>
          )}

          <Button asChild className="w-full">
            <Link to={`/g/order/${orderNumber}`}>前往訂單查詢／回報匯款</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
