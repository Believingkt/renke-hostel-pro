import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Calendar,
  User,
  Receipt,
  Clock,
  Info,
  Home,
  Timer,
} from "lucide-react";
import { AtmPaymentPanel } from "@/components/payment/AtmPaymentPanel";

interface OrderRow {
  id: string;
  order_number: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string | null;
  check_in_date: string;
  check_out_date: string;
  final_price: number;
  paid_amount: number;
  payment_status: string;
  order_status: string;
  atm_vacc_no: string | null;
  atm_vacc_bank_code: string | null;
  atm_expire_at: string | null;
  accommodation_id: string | null;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return { expired: true as const, text: "已逾期" };
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} 天`);
  if (hours > 0 || days > 0) parts.push(`${hours} 小時`);
  parts.push(`${minutes} 分`);
  if (days === 0 && hours === 0) parts.push(`${seconds} 秒`);
  return { expired: false as const, text: parts.join(" ") };
}

function AtmDeadlineAlert({ expireAt }: { expireAt: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const deadline = new Date(expireAt).getTime();
  const diff = deadline - now;
  const { expired, text } = formatCountdown(diff);

  if (expired) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertTriangle className="h-5 w-5" />
        <AlertTitle className="text-sm font-semibold">繳費期限已過</AlertTitle>
        <AlertDescription className="text-xs leading-relaxed">
          此虛擬帳號已於 {new Date(expireAt).toLocaleString("zh-TW")} 逾期。訂單可能已被自動取消，房間庫存已釋出。如已匯款請聯繫客服處理。
        </AlertDescription>
      </Alert>
    );
  }

  const urgent = diff < 3600000; // < 1 hour
  const warning = diff < 86400000; // < 1 day

  return (
    <div
      className={`mb-4 rounded-lg border px-4 py-3 flex items-start gap-3 ${
        urgent
          ? "border-destructive bg-destructive/10 text-destructive"
          : warning
          ? "border-amber-400 bg-amber-50 text-amber-900"
          : "border-primary/40 bg-primary/5 text-primary"
      }`}
    >
      <Timer className={`h-5 w-5 shrink-0 mt-0.5 ${urgent ? "animate-pulse" : ""}`} />
      <div>
        <div className="text-sm font-semibold">
          {urgent
            ? "⚠️ 繳費期限即將到期"
            : warning
            ? "繳費期限將至，請盡速匯款"
            : "繳費期限倒數計時"}
        </div>
        <div className={`text-lg font-bold mt-1 font-mono ${urgent ? "animate-pulse" : ""}`}>
          {text}
        </div>
        <div className="text-xs mt-1 opacity-80">
          期限：{new Date(expireAt).toLocaleString("zh-TW")}
        </div>
      </div>
    </div>
  );
}

export default function AtmBookingSuccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const orderNumber = params.get("order_number") || "";
  const accId = params.get("acc") || "";

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!orderNumber) {
        setError("缺少訂單編號");
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, guest_name, guest_phone, guest_email, check_in_date, check_out_date, final_price, paid_amount, payment_status, order_status, atm_vacc_no, atm_vacc_bank_code, atm_expire_at, accommodation_id",
        )
        .eq("order_number", orderNumber)
        .maybeSingle();
      if (!alive) return;
      if (error || !data) {
        setError(error?.message || "找不到訂單");
      } else {
        setOrder(data as OrderRow);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [orderNumber]);

  const nights = useMemo(() => {
    if (!order) return 0;
    const a = new Date(order.check_in_date).getTime();
    const b = new Date(order.check_out_date).getTime();
    return Math.max(1, Math.round((b - a) / 86400000));
  }, [order]);

  const remainingAmount = useMemo(() => {
    if (!order) return 0;
    return Math.max(0, (order.final_price || 0) - (order.paid_amount || 0));
  }, [order]);

  const atmActive =
    !!order?.atm_vacc_no && !!order?.atm_expire_at && new Date(order.atm_expire_at) > new Date();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary mb-2" />
          <p className="text-sm text-muted-foreground">載入訂單中...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 space-y-4 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <p className="text-base font-semibold">{error || "找不到訂單"}</p>
            <Button onClick={() => navigate("/")} variant="outline">
              <Home className="h-4 w-4 mr-2" />
              回首頁
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 py-6 md:py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* 成功標題 */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-primary/10">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold">訂單已建立</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            請於下方完成 ATM 匯款，我們收到入帳通知後將自動確認您的訂房。
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-sm">訂單編號 {order.order_number}</Badge>
            <Badge variant="outline" className="text-sm">待付款</Badge>
          </div>
        </div>

        {/* 訂單摘要 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              訂單摘要
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-xs text-muted-foreground">訂房人</div>
                <div className="font-medium">{order.guest_name}　{order.guest_phone}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-xs text-muted-foreground">入住期間</div>
                <div className="font-medium">
                  {order.check_in_date} → {order.check_out_date}（共 {nights} 晚）
                </div>
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">應付總金額</span>
              <span className="font-semibold">NT$ {order.final_price.toLocaleString()}</span>
            </div>
            {order.paid_amount > 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>已付</span>
                <span>NT$ {order.paid_amount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-base">
              <span className="font-semibold">需匯款金額</span>
              <span className="font-bold text-primary text-lg">NT$ {remainingAmount.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        {/* ATM 虛擬帳號區塊 */}
        <Card className="border-primary/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              ATM 虛擬帳號
            </CardTitle>
          </CardHeader>
          <CardContent>
            {order.atm_expire_at && (
              <AtmDeadlineAlert expireAt={order.atm_expire_at} />
            )}
            {!atmActive && !order.atm_expire_at && (
              <Alert className="mb-4 border-primary/30 bg-primary/5">
                <Info className="h-4 w-4" />
                <AlertTitle className="text-sm">請選擇您要使用的轉帳銀行</AlertTitle>
                <AlertDescription className="text-xs">
                  系統將為此筆訂單開立專屬虛擬帳號，僅可用於本筆訂單。
                </AlertDescription>
              </Alert>
            )}
            <AtmPaymentPanel
              orderId={order.id}
              orderNumber={order.order_number}
              amount={remainingAmount || order.final_price}
              cardholder={{
                name: order.guest_name,
                email: order.guest_email || "noreply@lakeze.com",
                phoneNumber: order.guest_phone,
              }}
              initialAtmInfo={
                atmActive
                  ? {
                      vaccNo: order.atm_vacc_no!,
                      bankCode: order.atm_vacc_bank_code,
                      expireAt: order.atm_expire_at!,
                      amount: remainingAmount || order.final_price,
                    }
                  : null
              }
              onCreated={(info) => {
                setOrder((prev) =>
                  prev
                    ? {
                        ...prev,
                        atm_vacc_no: info.vaccNo,
                        atm_vacc_bank_code: info.bankCode || null,
                        atm_expire_at: info.expireAt,
                      }
                    : prev,
                );
              }}
            />
          </CardContent>
        </Card>

        {/* 匯款說明 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              匯款說明
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            <ol className="list-decimal pl-5 space-y-2 text-muted-foreground leading-relaxed">
              <li>取得虛擬帳號後，請於繳費期限內以 <span className="font-medium text-foreground">ATM、網路銀行或臨櫃</span> 方式匯款。</li>
              <li>轉帳金額請務必與顯示金額一致，<span className="font-medium text-foreground">不可分次匯款</span>，否則無法自動對帳。</li>
              <li>系統收到入帳通知後將自動更新訂單狀態，並寄發訂房確認信至您的 Email。</li>
              <li>逾期未繳款，訂單將自動取消，房間庫存會釋出供其他旅客預訂。</li>
              <li>若已完成匯款但長時間未收到確認信，請聯繫客服並提供訂單編號 <span className="font-mono font-medium text-foreground">{order.order_number}</span>。</li>
            </ol>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <Button variant="outline" onClick={() => navigate("/")}>
            <Home className="h-4 w-4 mr-2" />
            回首頁
          </Button>
          {accId && (
            <Button variant="ghost" onClick={() => navigate(`/member/orders`)}>
              查看我的訂單
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
