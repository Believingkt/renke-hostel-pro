import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Loader2 } from "lucide-react";

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

  const order = data?.order;
  const reported = (data?.events ?? []).some((e: any) => e.event_type === "guest_reported");
  const confirmed = (data?.events ?? []).some((e: any) => e.event_type === "admin_confirmed");

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

            {data.campaign?.contactNote && (
              <p className="text-center text-muted-foreground">{data.campaign.contactNote}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
