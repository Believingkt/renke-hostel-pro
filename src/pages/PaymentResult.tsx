import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, Home, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type PaymentStatus = 'loading' | 'success' | 'failed' | 'error';

interface TransactionInfo {
  recTradeId: string;
  bankTransactionId?: string;
  orderNumber?: string;
  amount?: number;
  authCode?: string;
}

export default function PaymentResult() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<PaymentStatus>('loading');
  const [transaction, setTransaction] = useState<TransactionInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Get rec_trade_id from TapPay redirect URL params
  const recTradeId = searchParams.get('rec_trade_id');
  const orderNumber = searchParams.get('order_number');
  const tappayStatus = searchParams.get('status');

  useEffect(() => {
    const queryTransaction = async () => {
      if (!recTradeId) {
        setStatus('error');
        setErrorMessage('缺少交易編號，無法查詢付款結果');
        return;
      }

      // Note: Don't rely solely on URL status param for 3D Secure
      // Always query TapPay API to get actual transaction status

      try {
        // Query TapPay for transaction status
        const { data, error } = await supabase.functions.invoke('tappay-query', {
          body: { recTradeId },
        });

        if (error) throw error;

        if (data.success && data.paymentSuccess) {
          setStatus('success');
          setTransaction({
            recTradeId: data.recTradeId,
            bankTransactionId: data.bankTransactionId,
            orderNumber: data.orderNumber,
            amount: data.amount,
            authCode: data.authCode,
          });
        } else {
          setStatus('failed');
          setTransaction({ recTradeId, orderNumber: data.orderNumber || orderNumber || undefined });
          setErrorMessage(data.message || '付款驗證失敗');
        }
      } catch (err: any) {
        console.error('Query transaction error:', err);
        setStatus('error');
        setErrorMessage(err.message || '查詢交易狀態時發生錯誤');
      }
    };

    queryTransaction();
  }, [recTradeId, orderNumber, tappayStatus]);

  const handleRetry = () => {
    // Go back to previous page or booking
    navigate(-1);
  };

  const handleHome = () => {
    navigate('/');
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <h2 className="text-xl font-semibold">正在確認付款結果...</h2>
            <p className="text-muted-foreground text-sm">
              請稍候，我們正在向銀行確認您的交易狀態
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-700">付款成功！</CardTitle>
            <CardDescription>
              您的付款已完成，感謝您的訂購
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              {transaction?.amount && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">付款金額</span>
                  <span className="font-semibold">NT$ {transaction.amount.toLocaleString()}</span>
                </div>
              )}
              {transaction?.orderNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">訂單編號</span>
                  <span className="font-mono text-xs">{transaction.orderNumber}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">交易編號</span>
                <span className="font-mono text-xs">{transaction?.recTradeId}</span>
              </div>
              {transaction?.authCode && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">授權碼</span>
                  <span className="font-mono">{transaction.authCode}</span>
                </div>
              )}
            </div>
            <Button onClick={handleHome} className="w-full">
              <Home className="h-4 w-4 mr-2" />
              返回首頁
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mb-4">
              <XCircle className="h-10 w-10 text-orange-600" />
            </div>
            <CardTitle className="text-2xl text-orange-700">付款未完成</CardTitle>
            <CardDescription>
              {errorMessage || '您的付款未能成功完成'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {transaction && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">交易編號</span>
                  <span className="font-mono text-xs">{transaction.recTradeId}</span>
                </div>
                {transaction.orderNumber && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">訂單編號</span>
                    <span className="font-mono text-xs">{transaction.orderNumber}</span>
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleHome} className="flex-1">
                <Home className="h-4 w-4 mr-2" />
                返回首頁
              </Button>
              <Button onClick={handleRetry} className="flex-1">
                <RotateCw className="h-4 w-4 mr-2" />
                重新付款
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <AlertTriangle className="h-10 w-10 text-red-600" />
          </div>
          <CardTitle className="text-2xl text-red-700">查詢失敗</CardTitle>
          <CardDescription>
            {errorMessage || '無法確認付款狀態'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            如果您已完成付款，請聯繫客服確認訂單狀態。
          </p>
          <Button onClick={handleHome} className="w-full">
            <Home className="h-4 w-4 mr-2" />
            返回首頁
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
