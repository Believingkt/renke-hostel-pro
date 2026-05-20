import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { Link2, Copy, Check, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { getPaymentOriginForAccommodation } from "@/utils/paymentDomain";

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

  // 計算待付金額
  const unpaidAmount = order ? order.final_price - (order.paid_amount || 0) : 0;
  const depositAmount = order?.deposit_amount || 0;
  const balanceAmount = order ? order.final_price - depositAmount : 0;
  const isAtm = /atm|虛擬帳號/i.test(`${order?.payment_method || ""} ${order?.balance_payment_method || ""}`);
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
      const link = `${baseUrl}/pay/order?order_number=${encodeURIComponent(order.order_number)}&amount=${paymentAmount}&acc=${encodeURIComponent(accId)}`;
      setGeneratedLink(link);
    });

    return () => {
      cancelled = true;
    };
  }, [order, paymentAmount]);

  // 重置狀態
  useEffect(() => {
    if (!open) {
      setPaymentType('full');
      setCustomAmount('');
      setCopied(false);
      setGeneratedLink('');
    }
  }, [open]);

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
      await supabase
        .from('orders')
        .update({ payment_link_created_at: new Date().toISOString() } as any)
        .eq('id', order.id);
    } catch (err) {
      console.error('Failed to save payment link timestamp:', err);
    }
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
                <span className="text-warning font-medium">連結有效期限為 3 天。</span>
              </p>
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
        </>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>線上收款</DrawerTitle>
            <DrawerDescription>生成付款連結讓客人線上刷卡</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6">{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>線上收款</DialogTitle>
          <DialogDescription>生成付款連結讓客人線上刷卡</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
