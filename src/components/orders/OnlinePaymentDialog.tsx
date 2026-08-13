import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { Link2, Copy, Check, CheckCircle2, Clock, RefreshCw, History as HistoryIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { getPaymentOriginForAccommodation } from "@/utils/paymentDomain";
import { formatCountdown } from "@/hooks/use-pending-atm-orders";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


/** 付款連結有效期：3 天 */
const LINK_TTL_MS = 3 * 24 * 60 * 60 * 1000;

interface LinkState {
  payment_link_created_at: string | null;
  atm_vacc_no: string | null;
  atm_vacc_bank_code: string | null;
  atm_expire_at: string | null;
}

interface PaymentLinkLog {
  id: string;
  created_at: string;
  amount: number;
  method: string;
  acc_param: string | null;
  action: string;
  performed_by_email: string | null;
  note: string | null;
}

const ACTION_LABEL: Record<string, string> = {
  copy: "複製連結",
  regenerate: "重新產生連結",
  regenerate_atm_void: "作廢帳號並重產",
};

interface OnlinePaymentDialogProps {

  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: {
    id: string;
    order_number: string;
    guest_name: string;
    guest_phone: string;
    guest_email: string | null;
    final_price: number;
    payment_status: string;
    deposit_amount: number;
    paid_amount: number;
    accommodation_id?: string;
    payment_method?: string | null;
    balance_payment_method?: string | null;
  } | null;
  onPaymentSuccess: () => void;
}

export function OnlinePaymentDialog({ 
  open, 
  onOpenChange, 
  order,
  onPaymentSuccess 
}: OnlinePaymentDialogProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const [paymentType, setPaymentType] = useState<'full' | 'deposit' | 'balance' | 'custom'>('full');
  const [customAmount, setCustomAmount] = useState('');
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [methodOverride, setMethodOverride] = useState<'card' | 'atm' | null>(null);
  const [linkState, setLinkState] = useState<LinkState | null>(null);
  const [logs, setLogs] = useState<PaymentLinkLog[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [regenerating, setRegenerating] = useState(false);
  const [confirmAtmVoid, setConfirmAtmVoid] = useState(false);


  // 計算待付金額
  const unpaidAmount = order ? order.final_price - (order.paid_amount || 0) : 0;
  const depositAmount = order?.deposit_amount || 0;
  const balanceAmount = order ? order.final_price - depositAmount : 0;
  const detectedIsAtm = /atm|虛擬帳號/i.test(`${order?.payment_method || ""} ${order?.balance_payment_method || ""}`);
  const isAtm = methodOverride ? methodOverride === 'atm' : detectedIsAtm;
  const payVerb = isAtm ? "ATM 虛擬帳號" : "線上刷卡";

  // 設定付款金額
  useEffect(() => {
    if (!order) return;
    
    switch (paymentType) {
      case 'full':
        setPaymentAmount(unpaidAmount);
        break;
      case 'deposit':
        setPaymentAmount(depositAmount);
        break;
      case 'balance':
        setPaymentAmount(balanceAmount);
        break;
      case 'custom':
        setPaymentAmount(parseInt(customAmount) || 0);
        break;
    }
  }, [paymentType, customAmount, order, unpaidAmount, depositAmount, balanceAmount]);

  // 自動生成付款連結
  useEffect(() => {
    if (!order || paymentAmount <= 0) {
      setGeneratedLink('');
      return;
    }

    let cancelled = false;
    const accId = order.accommodation_id || '';

    getPaymentOriginForAccommodation(accId).then((baseUrl) => {
      if (cancelled) return;
      const params = new URLSearchParams({
        order_number: order.order_number,
        amount: String(paymentAmount),
        acc: accId,
      });
      if (isAtm) params.set("method", "atm");
      const link = `${baseUrl}/pay/order?${params.toString()}`;
      setGeneratedLink(link);
    });

    return () => {
      cancelled = true;
    };
  }, [order, paymentAmount, isAtm]);

  // 重置狀態
  useEffect(() => {
    if (!open) {
      setPaymentType('full');
      setCustomAmount('');
      setCopied(false);
      setGeneratedLink('');
      setMethodOverride(null);
      setLinkState(null);
      setLogs([]);
      setConfirmAtmVoid(false);
    }
  }, [open]);

  // 讀取訂單目前的連結時間戳、ATM 虛擬帳號狀態與歷史紀錄
  const refreshLinkState = async () => {
    if (!order) return;
    const { data } = await supabase
      .from('orders')
      .select('payment_link_created_at, atm_vacc_no, atm_vacc_bank_code, atm_expire_at')
      .eq('id', order.id)
      .maybeSingle();
    if (data) setLinkState(data as LinkState);

    const { data: logRows } = await supabase
      .from('payment_link_logs')
      .select('id, created_at, amount, method, acc_param, action, performed_by_email, note')
      .eq('order_id', order.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setLogs((logRows || []) as PaymentLinkLog[]);
  };

  useEffect(() => {
    if (open && order) refreshLinkState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order?.id]);

  // 倒數計時器
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  const linkCreatedAt = linkState?.payment_link_created_at
    ? new Date(linkState.payment_link_created_at)
    : null;
  const linkExpiresAt = linkCreatedAt ? new Date(linkCreatedAt.getTime() + LINK_TTL_MS) : null;
  const linkExpired = !!linkExpiresAt && linkExpiresAt.getTime() <= now;
  const atmActive =
    !!linkState?.atm_vacc_no &&
    !!linkState?.atm_expire_at &&
    new Date(linkState.atm_expire_at).getTime() > now;
  const unpaidOrder = (order?.paid_amount || 0) < (order?.final_price || 0);

  const writeLog = async (action: string, note?: string) => {
    if (!order || !generatedLink) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('payment_link_logs').insert({
        order_id: order.id,
        accommodation_id: order.accommodation_id || null,
        order_number: order.order_number,
        amount: paymentAmount,
        method: isAtm ? 'atm' : 'card',
        acc_param: order.accommodation_id || null,
        link_url: generatedLink,
        action,
        performed_by: user.id,
        performed_by_email: user.email ?? null,
        note: note ?? null,
      } as any);
    } catch (err) {
      console.error('Failed to write payment link log:', err);
    }
  };

  const stampLink = async () => {
    if (!order) return;
    await supabase
      .from('orders')
      .update({ payment_link_created_at: new Date().toISOString() } as any)
      .eq('id', order.id);
  };

  const handleCopyLink = async () => {
    if (!generatedLink || !order) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "已複製付款連結",
        description: `可傳送給客人以 ${payVerb} 完成付款，連結有效期限為 3 天`,
      });
    } catch {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = generatedLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "已複製付款連結" });
    }

    // Save payment_link_created_at to the order (reset on every new link copy)
    try {
      await stampLink();
      await writeLog('copy');
      await refreshLinkState();
    } catch (err) {
      console.error('Failed to save payment link timestamp:', err);
    }
  };

  // 重新產生連結（重置 3 天效期）
  const handleRegenerate = async (voidAtm: boolean) => {
    if (!order) return;
    setRegenerating(true);
    try {
      if (voidAtm) {
        await supabase
          .from('orders')
          .update({
            atm_vacc_no: null,
            atm_vacc_bank_code: null,
            atm_expire_at: null,
            atm_rec_trade_id: null,
          } as any)
          .eq('id', order.id);
      }
      await stampLink();
      await writeLog(voidAtm ? 'regenerate_atm_void' : 'regenerate', voidAtm ? '作廢原虛擬帳號並重新產生連結' : undefined);
      await refreshLinkState();
      toast({
        title: '已重新產生付款連結',
        description: voidAtm ? '原虛擬帳號已作廢，客人開啟連結後可取得新帳號' : '有效期限已重新計算為 3 天',
      });
      onPaymentSuccess();
    } catch (err) {
      console.error(err);
      toast({ title: '重新產生失敗', description: String(err), variant: 'destructive' });
    } finally {
      setRegenerating(false);
      setConfirmAtmVoid(false);
    }
  };

  const onRegenerateClick = () => {
    if (isAtm && atmActive && unpaidOrder) {
      setConfirmAtmVoid(true);
      return;
    }
    handleRegenerate(false);
  };


  const content = (
    <div className="space-y-6 py-4">
      {/* 訂單資訊 */}
      <div className="bg-muted/50 rounded-lg p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">訂單編號</span>
          <span className="font-medium">{order?.order_number}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">訂購人</span>
          <span className="font-medium">{order?.guest_name}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">訂單金額</span>
          <span className="font-medium">NT$ {order?.final_price.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">已付金額</span>
          <span className="font-medium">NT$ {(order?.paid_amount || 0).toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm font-semibold border-t pt-2">
          <span>待付金額</span>
          <span className="text-primary">NT$ {unpaidAmount.toLocaleString()}</span>
        </div>
      </div>

      {unpaidAmount <= 0 ? (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>此訂單已全額付款完成</AlertDescription>
        </Alert>
      ) : (
        <>
          {/* 付款方式選擇 */}
          <div className="space-y-3">
            <Label>付款方式</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={!isAtm ? 'default' : 'outline'}
                onClick={() => setMethodOverride('card')}
                className="h-auto py-2"
              >
                <div className="text-left">
                  <div className="text-sm">線上刷卡</div>
                  <div className="text-xs opacity-80">信用卡即時付款</div>
                </div>
              </Button>
              <Button
                type="button"
                variant={isAtm ? 'default' : 'outline'}
                onClick={() => setMethodOverride('atm')}
                className="h-auto py-2"
              >
                <div className="text-left">
                  <div className="text-sm">ATM 虛擬帳號</div>
                  <div className="text-xs opacity-80">銀行轉帳</div>
                </div>
              </Button>
            </div>
            {methodOverride && (
              (methodOverride === 'atm') !== detectedIsAtm && (
                <p className="text-xs text-warning">
                  注意：此連結將以「{payVerb}」收款，與訂單原設定（{detectedIsAtm ? 'ATM' : '刷卡'}）不同，客人完成付款後系統會自動更新該筆款項方式。
                </p>
              )
            )}
          </div>

          {/* 付款金額選擇 */}
          <div className="space-y-3">
            <Label>付款金額</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={paymentType === 'full' ? 'default' : 'outline'}
                onClick={() => setPaymentType('full')}
                className="h-auto py-2"
              >
                <div className="text-left">
                  <div className="text-sm">全額付款</div>
                  <div className="text-xs opacity-80">NT$ {unpaidAmount.toLocaleString()}</div>
                </div>
              </Button>
              {depositAmount > 0 && order?.paid_amount === 0 && (
                <Button
                  type="button"
                  variant={paymentType === 'deposit' ? 'default' : 'outline'}
                  onClick={() => setPaymentType('deposit')}
                  className="h-auto py-2"
                >
                  <div className="text-left">
                    <div className="text-sm">訂金</div>
                    <div className="text-xs opacity-80">NT$ {depositAmount.toLocaleString()}</div>
                  </div>
                </Button>
              )}
              {depositAmount > 0 && order?.paid_amount === depositAmount && (
                <Button
                  type="button"
                  variant={paymentType === 'balance' ? 'default' : 'outline'}
                  onClick={() => setPaymentType('balance')}
                  className="h-auto py-2"
                >
                  <div className="text-left">
                    <div className="text-sm">尾款</div>
                    <div className="text-xs opacity-80">NT$ {balanceAmount.toLocaleString()}</div>
                  </div>
                </Button>
              )}
              <Button
                type="button"
                variant={paymentType === 'custom' ? 'default' : 'outline'}
                onClick={() => setPaymentType('custom')}
                className="h-auto py-2"
              >
                <div className="text-left">
                  <div className="text-sm">自訂金額</div>
                  <div className="text-xs opacity-80">輸入金額</div>
                </div>
              </Button>
            </div>

            {paymentType === 'custom' && (
              <Input
                type="number"
                placeholder="輸入付款金額"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                min={1}
                max={unpaidAmount}
              />
            )}

            {paymentAmount > 0 && (
              <div className="text-center py-2 bg-primary/10 rounded-lg">
                <span className="text-sm text-muted-foreground">本次收款金額：</span>
                <span className="text-lg font-bold text-primary ml-2">
                  NT$ {paymentAmount.toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* 付款連結 */}
          {generatedLink && (
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                付款連結
              </Label>
              <Input
                readOnly
                value={generatedLink}
                className="text-xs font-mono"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <p className="text-xs text-muted-foreground">
                複製連結傳送給客人，客人開啟後即可{isAtm ? "取得 ATM 虛擬帳號完成轉帳" : "自行輸入信用卡完成付款"}。
                <span className="text-warning font-medium">連結有效期限為 3 天（自複製／重新產生起算）。</span>
              </p>

              {/* 效期倒數 */}
              {linkExpiresAt && (
                <div
                  className={`rounded-lg p-3 text-sm space-y-1 ${
                    linkExpired ? "bg-destructive/10" : "bg-muted/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      連結到期時間
                    </span>
                    <span className="font-medium tabular-nums">
                      {linkExpiresAt.toLocaleString("zh-TW", { hour12: false })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">剩餘時間</span>
                    {linkExpired ? (
                      <span className="font-semibold text-destructive">已過期</span>
                    ) : (
                      <span className="font-semibold text-primary tabular-nums">
                        {formatCountdown(linkExpiresAt, now)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 重新產生連結 */}
              <Button
                type="button"
                variant={linkExpired ? "default" : "outline"}
                className="w-full"
                disabled={regenerating}
                onClick={onRegenerateClick}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${regenerating ? "animate-spin" : ""}`} />
                {linkExpired ? "連結已過期，重新產生" : "重新產生連結（重置 3 天效期）"}
              </Button>
            </div>
          )}

          {/* 複製連結按鈕 */}
          {generatedLink && (
            <Button
              onClick={handleCopyLink}
              className="w-full"
              size="lg"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  已複製付款連結
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  複製付款連結
                </>
              )}
            </Button>
          )}

          {/* 連結操作紀錄 */}
          {logs.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <HistoryIcon className="h-4 w-4" />
                連結操作紀錄
              </Label>
              <div className="max-h-56 overflow-y-auto rounded-lg border divide-y">
                {logs.map((log) => (
                  <div key={log.id} className="p-2 text-xs space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {ACTION_LABEL[log.action] || log.action}
                        <span className="ml-2 text-muted-foreground">
                          {log.method === "atm" ? "ATM" : "刷卡"}
                        </span>
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {new Date(log.created_at).toLocaleString("zh-TW", { hour12: false })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-muted-foreground">
                      <span>NT$ {Number(log.amount).toLocaleString()}</span>
                      <span className="truncate">{log.performed_by_email || "—"}</span>
                    </div>
                    {log.acc_param && (
                      <div className="text-muted-foreground font-mono truncate">acc={log.acc_param}</div>
                    )}
                    {log.note && <div className="text-muted-foreground">{log.note}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );

  const atmConfirm = (
    <AlertDialog open={confirmAtmVoid} onOpenChange={setConfirmAtmVoid}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>已有尚未繳費的虛擬帳號</AlertDialogTitle>
          <AlertDialogDescription>
            此訂單目前已開立虛擬帳號 {linkState?.atm_vacc_no}
            {linkState?.atm_vacc_bank_code ? `（銀行代碼 ${linkState.atm_vacc_bank_code}）` : ""}，
            到期時間{" "}
            {linkState?.atm_expire_at
              ? new Date(linkState.atm_expire_at).toLocaleString("zh-TW", { hour12: false })
              : "—"}
            。是否要作廢原帳號並重新產生連結？客人須改用新帳號轉帳，請務必通知客人。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={regenerating}>保留原帳號</AlertDialogCancel>
          <AlertDialogAction disabled={regenerating} onClick={() => handleRegenerate(true)}>
            作廢並重新產生
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent className="max-h-[92vh]">
            <DrawerHeader className="text-left">
              <DrawerTitle>線上收款</DrawerTitle>
              <DrawerDescription>生成付款連結讓客人以 {payVerb} 完成付款</DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-[env(safe-area-inset-bottom)] overflow-y-auto">
              <div className="pb-6">{content}</div>
            </div>
          </DrawerContent>
        </Drawer>
        {atmConfirm}
      </>
    );
  }


  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>線上收款</DialogTitle>
            <DialogDescription>生成付款連結讓客人以 {payVerb} 完成付款</DialogDescription>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
      {atmConfirm}
    </>

  );
}
