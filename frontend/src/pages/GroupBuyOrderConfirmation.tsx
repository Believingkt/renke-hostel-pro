import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CancellationPolicyLines } from "@/components/groupbuy/CancellationPolicyLines";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Clock, Loader2, MailCheck, MapPin } from "lucide-react";
import { AtmPaymentPanel } from "@/components/payment/AtmPaymentPanel";

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
  const state = (location.state ?? {}) as {
    phoneLast4?: string;
    result?: any;
    paymentMethod?: "bank" | "atm";
    fromCreditCard?: boolean;
  };
  const phoneLast4 = (state.phoneLast4 ?? "").replace(/\D/g, "").slice(-4);
  const fromCreditCard = state.fromCreditCard === true;
  /** ATM 判定 SoT：訂單實際 payment_method（lookup 回傳），導頁 state 僅作為尚未查到訂單時的 fallback */
  const useAtmFallback = state.paymentMethod === "atm";

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!orderNumber || phoneLast4.length !== 4) {
      setLoading(false);
      return;
    }
    let stopped = false;
    const fetchOnce = async () => {
      const { data: res } = await supabase.functions.invoke("group-buy-order-lookup", {
        body: { orderNumber, phoneLast4, action: "lookup" },
      });
      if (!stopped && res && !(res as any).error) setData(res);
      return res as any;
    };
    (async () => {
      await fetchOnce();
      setLoading(false);
    })();

    /**
     * 待付款（ATM／匯款）時短輪詢，TapPay 入帳後不需 reload 即可切換為「訂金已付」；
     * 一旦 depositPaid／paid／cancelled 立即停止輪詢。
     */
    const timer = window.setInterval(async () => {
      const res = await fetchOnce();
      const o = res?.order;
      if (
        !o || o.depositPaid === true || o.orderStatus === "cancelled" ||
        ["deposit_paid", "paid", "partial", "partial_paid"].includes(String(o.paymentStatus ?? ""))
      ) {
        window.clearInterval(timer);
      }
    }, 8000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber]);

  const result = state.result ?? null;
  const order = data?.order ?? null;
  const emails: any[] = data?.emails ?? [];
  // 只看寄給旅客的信件事件；內部（民宿）通知與 raw metadata 一律不呈現給客人
  const guestEmails = emails.filter((e) => !e.recipientType || e.recipientType === "guest");
  const bookingMail = guestEmails.find((e) => !e.templateType || e.templateType === "booking_pending") ?? null;
  const bookingMailState: MailState = bookingMail
    ? bookingMail.status
    : result
      ? (result.emailSent ? "sent" : "failed")
      : "pending";
  const confirmed = (data?.events ?? []).some((e: any) => e.event_type === "admin_confirmed");
  const depositMail = guestEmails.find((e) => e.templateType === "deposit_received") ?? null;
  const depositMailState: MailState = confirmed ? (depositMail?.status ?? "sent") : "pending";
  const maskedEmail: string | null = order?.guestEmailMasked ?? result?.guestEmailMasked ?? null;


  /**
   * 信用卡（TapPay）＝全額付款：不顯示匯款／ATM／訂金尾款。
   * 3DS 回程沒有電話後四碼可查詢，因此以導頁 state 與 complete-paid-order 回傳為準。
   */
  const fullPayment = order?.fullPayment === true ||
    result?.fullPayment === true ||
    String(order?.paymentProvider ?? result?.paymentProvider ?? "") === "tappay" ||
    fromCreditCard;
  const paidAmount = Number(order?.paidAmount ?? result?.paidAmount ?? 0);
  const channel: "atm" | "credit_card" | "bank" = order?.paymentChannel ??
    (fullPayment ? "credit_card" : useAtmFallback ? "atm" : "bank");
  const useAtm = channel === "atm";
  /** ATM 是否已入帳（orders.payment_status） */
  const depositPaid = order?.depositPaid === true;
  const bank = fullPayment || useAtm ? null : (data?.bank ?? result?.bank ?? null);
  const total = Number(order?.total ?? result?.total ?? result?.order?.total_price ?? 0);
  const deposit = fullPayment ? 0 : (order?.deposit ?? result?.deposit ?? 0);
  const balance = fullPayment ? 0 : (order?.balance ?? result?.balance ?? 0);
  const deadlineText = fullPayment ? null : (order?.paymentDeadlineText ?? result?.paymentDeadlineText ?? null);
  const checkInDate = order?.checkInDate ?? result?.checkInDate ?? result?.order?.check_in_date ?? null;
  const checkOutDate = order?.checkOutDate ?? result?.checkOutDate ?? result?.order?.check_out_date ?? null;

  /* 明細（信用卡回程由 complete-paid-order 直接帶回，不需電話後四碼） */
  const venue = data?.venue ?? result?.venue ?? null;
  const roomTypeName = result?.roomTypeName ?? null;
  const nights = result?.nights ?? null;
  const roomQuantity = order?.roomQuantity ?? result?.roomQuantity ?? null;
  const guestName = order?.guestName ?? result?.guestName ?? null;
  const paymentMethodText = result?.paymentMethodText ?? (fullPayment ? "信用卡（3D 驗證）" : null);
  const guestCompositionText = result?.adultCount != null
    ? `成人 ${result.adultCount}　兒童 ${result.childCount ?? 0}　幼兒 ${result.toddlerCount ?? 0}　嬰兒 ${
      result.infantCount ?? 0
    }`
    : null;
  const cancellationPolicy = order?.cancellationPolicy ??
    result?.cancellationPolicy ??
    (fullPayment ? "full_prepayment" : null);

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
            <CheckCircle2 className="h-5 w-5" /> {fullPayment ? "付款完成，訂房成功" : "訂房已成立，請完成訂金匯款"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-lg bg-muted p-4">
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">訂單編號</span>
              <span className="font-semibold">{orderNumber}</span>
            </div>
            {guestName && (
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">訂房人</span>
                <span>{guestName}</span>
              </div>
            )}
            {checkInDate && checkOutDate && (
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">入住 / 退房</span>
                <span>{checkInDate} → {checkOutDate}</span>
              </div>
            )}
            {roomTypeName && (
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">房型</span>
                <span>{roomTypeName}</span>
              </div>
            )}
            {nights && (
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">住宿</span>
                <span>{nights} 晚{roomQuantity ? ` × ${roomQuantity} 棟` : ""}</span>
              </div>
            )}
            {guestCompositionText && (
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">入住人數</span>
                <span>{guestCompositionText}</span>
              </div>
            )}
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">訂單總額</span>
              <span>{twd(total)}</span>
            </div>
            {fullPayment ? (
              <>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">已付金額（全額）</span>
                  <span className="font-semibold text-primary">{twd(paidAmount || total)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">尚需支付</span>
                  <span>{twd(0)}</span>
                </div>
                {paymentMethodText && (
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">付款方式</span>
                    <span>{paymentMethodText}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">應付訂金</span>
                  <span className="font-semibold text-primary">{twd(deposit)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">入住現場付清</span>
                  <span>{twd(balance)}</span>
                </div>
              </>
            )}
            {!fullPayment && deadlineText && (
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">匯款期限</span>
                <span className="font-semibold">{deadlineText}</span>
              </div>
            )}
          </div>

          <div className="rounded-lg border p-4">
            <p className="mb-1 font-semibold text-foreground">通知信狀態</p>
            {fullPayment ? (
              /* 信用卡全額付款只有一封旅客信：訂房確認＋付款完成（含完整訂單明細） */
              <MailRow
                label="訂房確認＋付款完成通知信"
                state={depositMail?.status ?? "sent"}
                note={`已寄至 ${maskedEmail ?? "您留下的電子信箱"}`}
              />
            ) : (
              <>
                <MailRow
                  label="訂房通知＋匯款資訊信"
                  state={bookingMailState}
                  note={
                    bookingMailState === "sent"
                      ? `訂房通知與匯款資訊已寄至 ${maskedEmail ?? "您留下的電子信箱"}`
                      : bookingMailState === "failed"
                        ? "通知信寄送失敗，請依下方匯款資訊完成匯款"
                        : "訂單成立後寄出"
                  }
                />
                <MailRow
                  label="訂金確認信"
                  state={depositMailState}
                  note={
                    depositMailState === "sent"
                      ? `訂金確認信已寄至 ${maskedEmail ?? "您留下的電子信箱"}`
                      : "民宿確認收到訂金後寄出"
                  }
                />
                {bookingMailState === "failed" && (
                  <p className="mt-2 text-xs text-destructive">
                    通知信寄送失敗，請直接依下方匯款資訊完成匯款，或與我們聯繫。
                  </p>
                )}
              </>
            )}
          </div>

          {venue && (
            <div className="rounded-lg border p-4">
              <p className="mb-1 font-semibold text-foreground">住宿資訊</p>
              <p>{venue.name}</p>
              {venue.address && (
                <p className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> {venue.address}
                </p>
              )}
              {venue.phone && <p className="text-muted-foreground">電話：{venue.phone}</p>}
            </div>
          )}

          {fullPayment ? (
            <p className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-primary">
              已完成信用卡全額付款，入住當天不需再支付尾款。
            </p>
          ) : useAtm && depositPaid ? (
            <p className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-primary">
              ATM 訂金 {twd(paidAmount || deposit)} 已入帳，訂房完成；尾款 {twd(balance)} 入住現場付清。
            </p>
          ) : useAtm ? (
            <div className="space-y-2">
              <p className="font-semibold text-foreground">ATM 虛擬帳號（訂金）</p>
              <AtmPaymentPanel
                orderId={order?.id ?? ""}
                orderNumber={orderNumber}
                amount={Math.max(0, Math.round(Number(deposit) || 0))}
                amountLabel="轉帳金額（訂金）"
                cardholder={{ name: order?.guestName ?? "訂購人", email: "", phoneNumber: "" }}
                createEndpoint="group-buy-start-payment"
                extraBody={{ phoneLast4, paymentType: "atm" }}
                expireInDays={3}
                deadlineLabel={deadlineText ?? undefined}
              />
            </div>
          ) : (
            bank && (
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
            )
          )}

          {/* 取消政策：依訂單實際付款制度（後端 lookup 回傳），不可依活動現狀判定 */}
          {cancellationPolicy && (
            <CancellationPolicyLines
              policy={cancellationPolicy}
              className="rounded-lg border p-4"
            />
          )}



          <Button asChild className="w-full">
            <Link to={`/g/order/${orderNumber}`}>
              {fullPayment || useAtm ? "前往訂單查詢" : "前往訂單查詢／回報匯款"}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
