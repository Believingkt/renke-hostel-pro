import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, CheckCircle2, XCircle, Copy, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface TestCard {
  name: string;
  number: string;
  expiry: string;
  cvv: string;
  expectedResult: 'success' | 'fail';
  description: string;
  errorType?: string;
}

const testCards: TestCard[] = [
  {
    name: "成功交易",
    number: "4242424242424242",
    expiry: "12/28",
    cvv: "123",
    expectedResult: 'success',
    description: "標準測試卡，交易成功"
  },
  {
    name: "卡片錯誤",
    number: "4000000000000002",
    expiry: "12/28",
    cvv: "123",
    expectedResult: 'fail',
    errorType: "卡片被拒絕",
    description: "模擬卡片驗證失敗"
  },
  {
    name: "餘額不足",
    number: "4000000000009995",
    expiry: "12/28",
    cvv: "123",
    expectedResult: 'fail',
    errorType: "餘額不足",
    description: "模擬卡片餘額不足"
  },
  {
    name: "過期卡片",
    number: "4000000000000069",
    expiry: "12/28",
    cvv: "123",
    expectedResult: 'fail',
    errorType: "卡片過期",
    description: "模擬卡片已過期"
  },
  {
    name: "處理錯誤",
    number: "4000000000000119",
    expiry: "12/28",
    cvv: "123",
    expectedResult: 'fail',
    errorType: "處理錯誤",
    description: "模擬付款處理錯誤"
  }
];

export default function PaymentTest() {
  const [isTapPayReady, setIsTapPayReady] = useState(false);
  const [cardValid, setCardValid] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedCard, setSelectedCard] = useState<TestCard | null>(null);
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    message: string;
    time: string;
  } | null>(null);

  // 載入 TapPay SDK
  useEffect(() => {
    const loadTapPaySDK = () => {
      if (window.TPDirect) {
        console.log('TapPay SDK already loaded');
        window.TPDirect.setupSDK('165714', 'app_zYcYVG6FPf8l3WOti1Xgda3ycBBnz43ovMBehd7XzxkuwB2wzV857jdGWKWP', 'sandbox');
        setIsTapPayReady(true);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://js.tappaysdk.com/sdk/tpdirect/v5.18.0';
      script.async = true;
      script.onload = () => {
        if (window.TPDirect) {
          console.log('TapPay SDK loaded');
          window.TPDirect.setupSDK('165714', 'app_zYcYVG6FPf8l3WOti1Xgda3ycBBnz43ovMBehd7XzxkuwB2wzV857jdGWKWP', 'sandbox');
          setIsTapPayReady(true);
        }
      };
      script.onerror = () => {
        console.error('Failed to load TapPay SDK');
        toast.error('無法載入 TapPay SDK');
      };
      document.body.appendChild(script);
    };

    loadTapPaySDK();
  }, []);

  // 設定 TapPay 表單
  useEffect(() => {
    if (!isTapPayReady) return;

    const timer = setTimeout(() => {
      if (!window.TPDirect) return;

      try {
        console.log('Setting up TapPay card form...');

        window.TPDirect.card.setup({
          fields: {
            number: {
              element: '#test-card-number',
              placeholder: '**** **** **** ****'
            },
            expirationDate: {
              element: '#test-card-expiration-date',
              placeholder: 'MM / YY'
            },
            ccv: {
              element: '#test-card-ccv',
              placeholder: 'CVV'
            }
          },
          styles: {
            input: {
              'font-size': '16px',
              'color': 'rgb(0, 0, 0)'
            },
            ':focus': {
              'color': 'rgb(0, 0, 0)'
            },
            '.valid': {
              'color': 'rgb(34, 197, 94)'
            },
            '.invalid': {
              'color': 'rgb(239, 68, 68)'
            }
          }
        });

        window.TPDirect.card.onUpdate((update: any) => {
          console.log('Card validation status:', update.canGetPrime);
          setCardValid(update.canGetPrime);
        });

        console.log('TapPay card form setup completed');
      } catch (error) {
        console.error('TapPay setup error:', error);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isTapPayReady]);

  // 快速填入測試卡號
  const fillTestCard = (card: TestCard) => {
    setSelectedCard(card);
    
    // 由於 TapPay 使用 iframe，我們無法直接設定值
    // 只能提示用戶手動輸入或顯示卡號供複製
    toast.success(`已選擇：${card.name}`, {
      description: "請手動輸入或點擊複製按鈕"
    });
  };

  // 複製到剪貼簿
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`已複製${label}`);
    }).catch(() => {
      toast.error('複製失敗');
    });
  };

  // 測試付款
  const testPayment = async () => {
    if (!window.TPDirect) {
      toast.error('TapPay SDK 尚未載入');
      return;
    }

    if (!cardValid) {
      toast.error('請先完整填寫信用卡資訊');
      return;
    }

    setIsProcessing(true);

    try {
      console.log('Getting prime token...');
      
      const primeResult = await new Promise<any>((resolve, reject) => {
        window.TPDirect.card.getPrime((result: any) => {
          console.log('getPrime result:', result);
          if (result.status !== 0) {
            reject(new Error(result.msg || '無法取得付款資訊'));
            return;
          }
          resolve(result);
        });
      });

      console.log('Prime token obtained:', primeResult.card.prime);
      
      const timestamp = new Date().toLocaleTimeString('zh-TW');
      setLastResult({
        success: true,
        message: `Prime Token 取得成功！Token: ${primeResult.card.prime.substring(0, 20)}...`,
        time: timestamp
      });
      
      toast.success('測試成功', {
        description: 'Prime Token 已成功取得'
      });
    } catch (error: any) {
      console.error('Test payment error:', error);
      
      const timestamp = new Date().toLocaleTimeString('zh-TW');
      setLastResult({
        success: false,
        message: error.message || '測試失敗',
        time: timestamp
      });
      
      toast.error('測試失敗', {
        description: error.message
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-12 px-4">
      <div className="container max-w-6xl mx-auto space-y-8">
        {/* 頁面標題 */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <CreditCard className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-bold">TapPay 付款測試</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            快速測試各種信用卡支付情境
          </p>
          <Badge variant="outline" className="text-sm">
            開發環境 • Sandbox Mode
          </Badge>
        </div>

        {/* 測試卡號列表 */}
        <div>
          <h2 className="text-2xl font-semibold mb-4">測試卡號</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {testCards.map((card, index) => (
              <Card 
                key={index}
                className={`cursor-pointer transition-all hover:shadow-lg ${
                  selectedCard?.number === card.number 
                    ? 'ring-2 ring-primary' 
                    : ''
                }`}
                onClick={() => fillTestCard(card)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{card.name}</CardTitle>
                    <Badge 
                      variant={card.expectedResult === 'success' ? 'default' : 'destructive'}
                      className="shrink-0"
                    >
                      {card.expectedResult === 'success' ? (
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                      ) : (
                        <XCircle className="w-3 h-3 mr-1" />
                      )}
                      {card.expectedResult === 'success' ? '成功' : '失敗'}
                    </Badge>
                  </div>
                  <CardDescription>{card.description}</CardDescription>
                  {card.errorType && (
                    <Badge variant="outline" className="w-fit mt-2">
                      {card.errorType}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between bg-muted/50 p-2 rounded">
                    <code className="text-sm">{card.number}</code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(card.number, '卡號');
                      }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center justify-between bg-muted/50 p-2 rounded">
                      <code className="text-sm">{card.expiry}</code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(card.expiry, '有效期限');
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between bg-muted/50 p-2 rounded">
                      <code className="text-sm">{card.cvv}</code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(card.cvv, 'CVV');
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* 付款表單 */}
        <Card>
          <CardHeader>
            <CardTitle>信用卡測試表單</CardTitle>
            <CardDescription>
              {selectedCard ? (
                <span className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  已選擇：{selectedCard.name} - {selectedCard.description}
                </span>
              ) : (
                "請選擇上方的測試卡號或手動輸入"
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 卡號 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">卡號</label>
              <div 
                id="test-card-number" 
                className="h-12 border rounded-md bg-background"
              />
            </div>

            {/* 有效期限和安全碼 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">有效期限</label>
                <div 
                  id="test-card-expiration-date" 
                  className="h-12 border rounded-md bg-background"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">安全碼 (CVV)</label>
                <div 
                  id="test-card-ccv" 
                  className="h-12 border rounded-md bg-background"
                />
              </div>
            </div>

            {/* 測試按鈕 */}
            <div className="space-y-3">
              <Button
                onClick={testPayment}
                disabled={!cardValid || isProcessing || !isTapPayReady}
                className="w-full h-12 text-lg"
                size="lg"
              >
                {isProcessing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    測試中...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5 mr-2" />
                    測試付款取得 Prime Token
                  </>
                )}
              </Button>
              
              {!isTapPayReady && (
                <p className="text-sm text-muted-foreground text-center">
                  載入 TapPay SDK 中...
                </p>
              )}
              {isTapPayReady && !cardValid && (
                <p className="text-sm text-muted-foreground text-center">
                  請填寫完整的信用卡資訊
                </p>
              )}
            </div>

            {/* 測試結果 */}
            {lastResult && (
              <Card className={
                lastResult.success 
                  ? "border-green-500 bg-green-500/5" 
                  : "border-red-500 bg-red-500/5"
              }>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    {lastResult.success ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 space-y-1">
                      <p className={`font-medium ${
                        lastResult.success ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                      }`}>
                        {lastResult.success ? "測試成功" : "測試失敗"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {lastResult.message}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        時間：{lastResult.time}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        {/* 說明 */}
        <Card>
          <CardHeader>
            <CardTitle>使用說明</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>點擊上方的測試卡號卡片來查看詳細資訊</li>
              <li>使用複製按鈕快速複製卡號、有效期限和 CVV</li>
              <li>在下方表單中手動輸入信用卡資訊</li>
              <li>點擊「測試付款」按鈕來驗證卡片並取得 Prime Token</li>
              <li>查看測試結果，確認是否符合預期</li>
            </ol>
            <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-400">
                <strong>注意：</strong>此頁面僅用於開發測試，不會進行實際扣款。所有測試卡號均為 TapPay Sandbox 環境的模擬卡號。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
