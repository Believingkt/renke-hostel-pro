import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2, MapPin, Undo2, XCircle } from "lucide-react";


const twd = (n: number) => `NT$ ${Math.round(n || 0).toLocaleString("en-US")}`;

export default function GroupBuyOrderLookup() {
  const { orderNumber: routeOrderNumber } = useParams<{ orderNumber?: string }>();
  const { toast } = useToast();

  const [orderNumber, setOrderNumber] = useState(routeOrderNumber ?? "");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [accountLast5, setAccountLast5] = useState("");
  const [transferredAt, setTransferredAt] = useState("");
  const [reporting, setReporting] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);


  useEffect(() => {
    if (routeOrderNumber) setOrderNumber(routeOrderNumber);
  }, [routeOrderNumber]);

  const lookup = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("group-buy-order-lookup", {
        body: { orderNumber, phoneLast4, action: "lookup" },
      });
      const payload: any = res;
      if (error || payload?.error) {
        toast({ title: "查詢失敗", description: payload?.error ?? error?.message, variant: "destructive" });
        return;
      }
      setData(payload);
    } finally {
      setLoading(false);
    }
  };

  const report = async () => {
    setReporting(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("group-buy-order-lookup", {
        body: { orderNumber, phoneLast4, action: "report_transfer", accountLast5, transferredAt },
      });
      const payload: any = res;
      if (error || payload?.error) {
        toast({ title: "回報失敗", description: payload?.error ?? error?.message, variant: "destructive" });
        return;
      }
      toast({ title: "已收到您的匯款回報", description: "我們核對入帳後會再寄出確認信" });
      await lookup();
    } finally {
      setReporting(false);
    }
  };

  const submitCancelRequest = async () => {
    setCancelSubmitting(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("group-buy-order-lookup", {
        body: { orderNumber, phoneLast4, action: "request_cancel", reason: cancelReason },
      });
      const payload: any = res;
      if (error || payload?.error) {
        toast({ title: "取消申請失敗", description: payload?.error ?? error?.message, variant: "destructive" });
        return;
      }
      toast({
        title: "已收到您的取消申請",
        description: "民宿確認後會處理退款，退款將於當月月底前完成。",
      });
      setCancelOpen(false);
      setCancelReason("");
      await lookup();
    } finally {
      setCancelSubmitting(false);
    }
  };

  const order = data?.order;
  const reported = (data?.events ?? []).some((e: any) => e.event_type === "guest_reported");
  const confirmed = (data?.events ?? []).some((e: any) => e.event_type === "admin_confirmed");
  const cancelRequest = data?.cancelRequest ?? null;


  return (
    <div className="mx-auto max-w-xl px-4 py-8 pb-20">
      <h1 className="mb-4 text-xl font-bold text-foreground">團購訂單查詢</h1>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div>
            <Label htmlFor="lookup-order">訂單編號</Label>
            <Input
              id="lookup-order"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
              placeholder="例如 A1B2C3D4"
            />
          </div>
          <div>
            <Label htmlFor="lookup-phone">聯絡電話後四碼</Label>
            <Input
              id="lookup-phone"
              inputMode="numeric"
              maxLength={4}
              value={phoneLast4}
              onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </div>
          <Button className="w-full" onClick={lookup} disabled={loading || !orderNumber || phoneLast4.length !== 4}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            查詢訂單
          </Button>
        </CardContent>
      </Card>

      {order && (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>{data.campaign?.title ?? "團購訂單"}</span>
              {order.orderStatus === "cancelled" ? (
                <Badge variant="destructive">已取消</Badge>
              ) : confirmed ? (
                <Badge className="bg-primary">已收訂金</Badge>
              ) : reported ? (
                <Badge variant="secondary">核對中</Badge>
              ) : (
                <Badge variant="outline">待匯款</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-lg bg-muted p-4">
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">訂單編號</span>
                <span className="font-semibold">{order.orderNumber}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">入住 / 退房</span>
                <span>
                  {order.checkInDate} → {order.checkOutDate}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">訂單總額</span>
                <span>{twd(order.total)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">應付訂金（{order.depositPercentage}%）</span>
                <span className="font-semibold text-primary">{twd(order.deposit)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">入住現場付清</span>
                <span>{twd(order.balance)}</span>
              </div>
              {order.orderStatus !== "cancelled" && !confirmed && (
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">匯款期限</span>
                  <span className="font-semibold">{order.paymentDeadlineText}</span>
                </div>
              )}
            </div>

            {data.bank && !confirmed && order.orderStatus !== "cancelled" && (
              <div className="rounded-lg border p-4">
                <p className="mb-2 font-semibold text-foreground">匯款資訊</p>
                <p>
                  {data.bank.bankName}
                  {data.bank.bankCode ? `（${data.bank.bankCode}）` : ""}
                  {data.bank.branchName ? ` ${data.bank.branchName}` : ""}
                </p>
                <p>戶名：{data.bank.accountName}</p>
                <p className="font-semibold">帳號：{data.bank.accountNumber}</p>
                {data.bank.note && <p className="text-muted-foreground">{data.bank.note}</p>}
              </div>
            )}

            {confirmed ? (
              <p className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-4 w-4" /> 訂金已確認入帳，訂房完成。
              </p>
            ) : order.orderStatus === "cancelled" ? (
              <p className="text-muted-foreground">此訂單已取消。若已完成匯款，請直接與我們聯繫。</p>
            ) : reported ? (
              <p className="text-muted-foreground">已收到您的匯款回報，我們核對入帳後會再寄出確認信。</p>
            ) : (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="font-semibold text-foreground">我已完成匯款</p>
                <div>
                  <Label htmlFor="acct5">匯款帳號後五碼</Label>
                  <Input
                    id="acct5"
                    inputMode="numeric"
                    maxLength={5}
                    value={accountLast5}
                    onChange={(e) => setAccountLast5(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  />
                </div>
                <div>
                  <Label htmlFor="tat">匯款時間</Label>
                  <Input id="tat" type="datetime-local" value={transferredAt} onChange={(e) => setTransferredAt(e.target.value)} />
                </div>
                <Button className="w-full" onClick={report} disabled={reporting || accountLast5.length !== 5}>
                  {reporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  送出匯款回報
                </Button>
              </div>
            )}

            {data.package && (
              <div className="rounded-lg border p-4">
                <p className="mb-2 font-semibold text-foreground">方案內容</p>
                <p className="font-medium text-foreground">{data.package.name}</p>
                {data.package.description && (
                  <p className="whitespace-pre-line text-muted-foreground">{data.package.description}</p>
                )}
              </div>
            )}

            {data.venue && (
              <div className="rounded-lg border p-4">
                <p className="mb-2 font-semibold text-foreground">住宿資訊</p>
                <p className="font-medium text-foreground">{data.venue.name}</p>
                {data.venue.address && (
                  <p className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /> {data.venue.address}
                  </p>
                )}
                {data.venue.phone && <p className="text-muted-foreground">電話：{data.venue.phone}</p>}
              </div>
            )}

            {data.checkInNotice && (
              <Accordion type="single" collapsible className="rounded-lg border px-4">
                <AccordionItem value="notice" className="border-0">
                  <AccordionTrigger className="text-sm font-semibold">入住須知</AccordionTrigger>
                  <AccordionContent className="whitespace-pre-line text-muted-foreground">
                    {data.checkInNotice}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {order.orderStatus !== "cancelled" && (
              <div className="rounded-lg border p-4">
                <p className="mb-1 flex items-center gap-2 font-semibold text-foreground">
                  <XCircle className="h-4 w-4" /> 取消訂單
                </p>
                {cancelRequest ? (
                  <div className="space-y-1 text-muted-foreground">
                    <p>已於 {new Date(cancelRequest.requestedAt).toLocaleString("zh-TW")} 收到您的取消申請，民宿審核中。</p>
                    <p className="font-medium text-foreground">若符合退款條件，退款將於當月月底前完成處理。</p>
                  </div>
                ) : cancelOpen ? (
                  <div className="space-y-3">
                    <p className="text-muted-foreground">
                      團購訂單為銀行匯款收款，退款由民宿人工處理；申請送出後將由民宿審核，
                      <span className="font-medium text-foreground">退款會在當月月底前處理完成</span>。
                    </p>
                    <div>
                      <Label htmlFor="cancel-reason">取消原因（選填）</Label>
                      <Textarea
                        id="cancel-reason"
                        rows={3}
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value.slice(0, 300))}
                        placeholder="例如：行程有變動"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={submitCancelRequest}
                        disabled={cancelSubmitting}
                      >
                        {cancelSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        送出取消申請
                      </Button>
                      <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelSubmitting}>
                        返回
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-muted-foreground">
                      需要取消這筆訂房嗎？送出申請後由民宿審核，退款將於當月月底前處理完成。
                    </p>
                    <Button variant="outline" className="w-full" onClick={() => setCancelOpen(true)}>
                      我要申請取消訂單
                    </Button>
                  </div>
                )}
              </div>
            )}

            {data.refund && (data.refund.amount > 0 || (data.refund.status && data.refund.status !== "none")) && (

              <div className="rounded-lg border p-4">
                <p className="mb-1 flex items-center gap-2 font-semibold text-foreground">
                  <Undo2 className="h-4 w-4" /> 退款狀態
                </p>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">處理狀態</span>
                  <span>
                    {data.refund.status === "refunded"
                      ? "已全額退款"
                      : data.refund.status === "partial_refunded"
                        ? "已部分退款"
                        : data.refund.status === "pending_manual"
                          ? "退款處理中"
                          : "不退款"}
                  </span>
                </div>
                {data.refund.amount > 0 && (
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">退款金額</span>
                    <span className="font-semibold">{twd(data.refund.amount)}</span>
                  </div>
                )}
                {data.refund.refundedAt && (
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">退款時間</span>
                    <span>{new Date(data.refund.refundedAt).toLocaleString("zh-TW")}</span>
                  </div>
                )}
              </div>
            )}

            {data.campaign?.contactNote && (
              <p className="text-center text-muted-foreground">{data.campaign.contactNote}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
