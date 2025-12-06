import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, CheckCircle2, XCircle, Copy, AlertCircle, Zap, ShieldCheck, ShieldX, PlayCircle, FileText, Download, Clock, Loader2, Smartphone, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface TestCard {
  name: string;
  number: string;
  expiry: string;
  cvv: string;
  expectedResult: 'success' | 'fail';
  description: string;
  errorType?: string;
}

interface CardValidation {
  isValid: boolean;
  cardNumber: { valid: boolean; message: string };
  expiry: { valid: boolean; message: string };
  cvv: { valid: boolean; message: string };
}

interface BatchTestResult {
  card: TestCard;
  validation: CardValidation;
  primeResult?: {
    success: boolean;
    prime?: string;
    error?: string;
  };
  paymentResult?: {
    success: boolean;
    transactionId?: string;
    errorCode?: number;
    message?: string;
  };
  testTime: string;
  duration: number;
}

// Luhn 演算法驗證卡號
const validateCardNumber = (cardNumber: string): { valid: boolean; message: string } => {
  const cleanNumber = cardNumber.replace(/\s|-/g, '');
  
  // 檢查是否只包含數字
  if (!/^\d+$/.test(cleanNumber)) {
    return { valid: false, message: '卡號只能包含數字' };
  }
  
  // 檢查長度 (通常為 13-19 位)
  if (cleanNumber.length < 13 || cleanNumber.length > 19) {
    return { valid: false, message: `卡號長度應為 13-19 位 (目前 ${cleanNumber.length} 位)` };
  }
  
  // Luhn 演算法
  let sum = 0;
  let isEven = false;
  
  for (let i = cleanNumber.length - 1; i >= 0; i--) {
    let digit = parseInt(cleanNumber[i], 10);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  if (sum % 10 !== 0) {
    return { valid: false, message: 'Luhn 驗證失敗' };
  }
  
  // 識別卡片類型
  const cardType = getCardType(cleanNumber);
  return { valid: true, message: `格式正確 (${cardType})` };
};

// 識別卡片類型
const getCardType = (cardNumber: string): string => {
  const patterns: { [key: string]: RegExp } = {
    'Visa': /^4/,
    'MasterCard': /^5[1-5]|^2[2-7]/,
    'JCB': /^35/,
    'American Express': /^3[47]/,
    'UnionPay': /^62/,
  };
  
  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(cardNumber)) {
      return type;
    }
  }
  return '未知卡別';
};

// 驗證有效期限
const validateExpiry = (expiry: string): { valid: boolean; message: string } => {
  // 支援格式：MM/YY 或 MM/YYYY
  const match = expiry.match(/^(\d{2})\/(\d{2,4})$/);
  
  if (!match) {
    return { valid: false, message: '格式應為 MM/YY 或 MM/YYYY' };
  }
  
  const month = parseInt(match[1], 10);
  let year = parseInt(match[2], 10);
  
  // 如果是兩位數年份，轉換為四位數
  if (year < 100) {
    year += 2000;
  }
  
  // 檢查月份範圍
  if (month < 1 || month > 12) {
    return { valid: false, message: '月份應為 01-12' };
  }
  
  // 檢查是否過期
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return { valid: false, message: '卡片已過期' };
  }
  
  // 檢查是否太遠 (通常不超過 20 年)
  if (year > currentYear + 20) {
    return { valid: false, message: '有效期限超出合理範圍' };
  }
  
  return { valid: true, message: `有效至 ${month.toString().padStart(2, '0')}/${year}` };
};

// 驗證 CVV
const validateCVV = (cvv: string, cardNumber?: string): { valid: boolean; message: string } => {
  // 檢查是否只包含數字
  if (!/^\d+$/.test(cvv)) {
    return { valid: false, message: 'CVV 只能包含數字' };
  }
  
  // 根據卡片類型檢查長度
  // American Express 使用 4 位 CVV，其他使用 3 位
  const isAmex = cardNumber && /^3[47]/.test(cardNumber.replace(/\s|-/g, ''));
  const expectedLength = isAmex ? 4 : 3;
  
  if (cvv.length !== expectedLength) {
    return { 
      valid: false, 
      message: isAmex 
        ? `AMEX CVV 應為 4 位 (目前 ${cvv.length} 位)` 
        : `CVV 應為 3 位 (目前 ${cvv.length} 位)` 
    };
  }
  
  return { valid: true, message: '格式正確' };
};

// 完整驗證測試卡
const validateTestCard = (card: TestCard): CardValidation => {
  const cardNumber = validateCardNumber(card.number);
  const expiry = validateExpiry(card.expiry);
  const cvv = validateCVV(card.cvv, card.number);
  
  return {
    isValid: cardNumber.valid && expiry.valid && cvv.valid,
    cardNumber,
    expiry,
    cvv,
  };
};

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
  const [paymentTestResult, setPaymentTestResult] = useState<{
    success: boolean;
    message: string;
    time: string;
    transactionId?: string;
    errorCode?: number;
    technicalMessage?: string;
  } | null>(null);

  // 批次測試狀態
  const [isBatchTesting, setIsBatchTesting] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [currentTestIndex, setCurrentTestIndex] = useState(0);
  const [batchResults, setBatchResults] = useState<BatchTestResult[]>([]);
  const [batchTestCompleted, setBatchTestCompleted] = useState(false);

  // LINE Pay 測試狀態
  const [isLinePayProcessing, setIsLinePayProcessing] = useState(false);
  const [linePayResult, setLinePayResult] = useState<{
    success: boolean;
    message: string;
    time: string;
    paymentUrl?: string;
    transactionId?: string;
    errorCode?: string;
    errorCategory?: string;
    suggestion?: string;
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

  // 測試完整支付流程
  const testFullPayment = async () => {
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
      console.log('Starting full payment flow test...');
      
      // 步驟 1: 取得 Prime Token
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
      toast.success('Prime Token 已取得', {
        description: '正在呼叫後端處理支付...'
      });

      // 步驟 2: 呼叫後端處理支付
      const testAmount = 1000; // 測試金額 NT$ 1,000
      // 生成符合格式的測試訂單編號 (YYYYMMDDNNN - 11位數字)
      const now = new Date();
      const datePrefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const testOrderId = `${datePrefix}999`; // e.g., 20251206999

      console.log('Calling process-tappay-payment edge function...');
      
      const { data: paymentResult, error: paymentError } = await supabase.functions.invoke(
        'process-tappay-payment',
        {
          body: {
            prime: primeResult.card.prime,
            amount: testAmount,
            orderId: testOrderId,
            cardholder: {
              phoneNumber: '0912345678',
              name: '測試用戶',
              email: 'test@example.com',
            },
            details: '付款測試 - 完整流程',
          },
        }
      );

      if (paymentError) {
        throw paymentError;
      }

      console.log('Payment result:', paymentResult);

      const timestamp = new Date().toLocaleTimeString('zh-TW');
      
      if (paymentResult.success) {
        setPaymentTestResult({
          success: true,
          message: '付款成功！',
          time: timestamp,
          transactionId: paymentResult.transactionId,
        });
        
        toast.success('完整支付流程測試成功', {
          description: `交易 ID: ${paymentResult.transactionId}`
        });
      } else {
        setPaymentTestResult({
          success: false,
          message: paymentResult.message || '付款失敗',
          time: timestamp,
          errorCode: paymentResult.errorCode,
          technicalMessage: paymentResult.technicalMessage,
        });
        
        toast.error('支付流程測試失敗', {
          description: paymentResult.message
        });
      }
    } catch (error: any) {
      console.error('Full payment test error:', error);
      
      const timestamp = new Date().toLocaleTimeString('zh-TW');
      setPaymentTestResult({
        success: false,
        message: error.message || '測試失敗',
        time: timestamp,
      });
      
      toast.error('完整支付流程測試失敗', {
        description: error.message
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 測試付款 (僅 Prime Token)
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

  // 批次測試所有卡號 (驗證模式)
  const runBatchTest = async () => {
    setIsBatchTesting(true);
    setBatchResults([]);
    setBatchProgress(0);
    setCurrentTestIndex(0);
    setBatchTestCompleted(false);

    const results: BatchTestResult[] = [];
    const totalCards = testCards.length;

    for (let i = 0; i < totalCards; i++) {
      const card = testCards[i];
      setCurrentTestIndex(i);
      
      const startTime = Date.now();
      const validation = validateTestCard(card);
      
      // 模擬測試延遲以顯示進度
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      const result: BatchTestResult = {
        card,
        validation,
        testTime: new Date().toLocaleTimeString('zh-TW'),
        duration,
      };

      results.push(result);
      setBatchResults([...results]);
      setBatchProgress(((i + 1) / totalCards) * 100);
    }

    setIsBatchTesting(false);
    setBatchTestCompleted(true);
    
    const validCount = results.filter(r => r.validation.isValid).length;
    toast.success('批次測試完成', {
      description: `${validCount}/${totalCards} 張卡片驗證通過`
    });
  };

  // 匯出測試報告
  const exportTestReport = () => {
    if (batchResults.length === 0) {
      toast.error('沒有測試結果可匯出');
      return;
    }

    const reportDate = new Date().toLocaleString('zh-TW');
    const validCount = batchResults.filter(r => r.validation.isValid).length;
    const totalCount = batchResults.length;

    let report = `===========================================\n`;
    report += `TapPay 測試卡號批次驗證報告\n`;
    report += `===========================================\n`;
    report += `報告產生時間: ${reportDate}\n`;
    report += `測試卡片數量: ${totalCount}\n`;
    report += `驗證通過數量: ${validCount}\n`;
    report += `驗證通過率: ${((validCount / totalCount) * 100).toFixed(1)}%\n`;
    report += `===========================================\n\n`;

    batchResults.forEach((result, index) => {
      report += `--- 測試卡 ${index + 1}: ${result.card.name} ---\n`;
      report += `卡號: ${result.card.number}\n`;
      report += `有效期限: ${result.card.expiry}\n`;
      report += `CVV: ${result.card.cvv}\n`;
      report += `預期結果: ${result.card.expectedResult === 'success' ? '成功' : '失敗'}\n`;
      report += `驗證狀態: ${result.validation.isValid ? '✓ 通過' : '✗ 失敗'}\n`;
      report += `  - 卡號驗證: ${result.validation.cardNumber.message}\n`;
      report += `  - 有效期限: ${result.validation.expiry.message}\n`;
      report += `  - CVV 驗證: ${result.validation.cvv.message}\n`;
      report += `測試時間: ${result.testTime}\n`;
      report += `耗時: ${result.duration}ms\n\n`;
    });

    report += `===========================================\n`;
    report += `報告結束\n`;
    report += `===========================================\n`;

    // 下載報告
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tappay-test-report-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('測試報告已下載');
  };

  // 重置批次測試
  const resetBatchTest = () => {
    setBatchResults([]);
    setBatchProgress(0);
    setCurrentTestIndex(0);
    setBatchTestCompleted(false);
  };

  // LINE Pay 測試
  const testLinePay = async () => {
    setIsLinePayProcessing(true);
    setLinePayResult(null);

    try {
      console.log('Starting LINE Pay test...');
      
      // 產生測試訂單編號 (符合 YYYYMMDDNNN 格式)
      const today = new Date();
      const datePrefix = today.toISOString().slice(0, 10).replace(/-/g, '');
      const testOrderId = `${datePrefix}999`; // 使用 999 作為測試序號
      const testAmount = 1000; // 測試金額 NT$ 1,000

      const { data: linePayData, error: linePayError } = await supabase.functions.invoke(
        'process-linepay-payment',
        {
          body: {
            action: 'request',
            amount: testAmount,
            orderId: testOrderId,
            orderData: {
              roomTypeId: 'test-room-type-id',
              roomTypeName: 'LINE Pay 測試房型',
              confirmUrl: `${window.location.origin}/linepay-confirm`,
              cancelUrl: `${window.location.origin}/payment-test`,
            },
          },
        }
      );

      if (linePayError) {
        throw linePayError;
      }

      console.log('LINE Pay response:', linePayData);

      const timestamp = new Date().toLocaleTimeString('zh-TW');

      if (linePayData.success) {
        setLinePayResult({
          success: true,
          message: 'LINE Pay 付款請求成功！',
          time: timestamp,
          paymentUrl: linePayData.paymentUrl,
          transactionId: linePayData.transactionId,
        });
        
        toast.success('LINE Pay 測試成功', {
          description: '已取得付款連結',
        });
      } else {
        setLinePayResult({
          success: false,
          message: linePayData.message || 'LINE Pay 請求失敗',
          time: timestamp,
          errorCode: linePayData.errorCode,
          errorCategory: linePayData.errorCategory,
          suggestion: linePayData.suggestion,
        });
        
        toast.error('LINE Pay 測試失敗', {
          description: linePayData.message,
        });
      }
    } catch (error: any) {
      console.error('LINE Pay test error:', error);
      
      const timestamp = new Date().toLocaleTimeString('zh-TW');
      setLinePayResult({
        success: false,
        message: error.message || 'LINE Pay 測試失敗',
        time: timestamp,
      });
      
      toast.error('LINE Pay 測試失敗', {
        description: error.message,
      });
    } finally {
      setIsLinePayProcessing(false);
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">測試卡號</h2>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    自動驗證已啟用
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>自動驗證卡號 (Luhn)、有效期限和 CVV 格式</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {testCards.map((card, index) => {
              const validation = validateTestCard(card);
              
              return (
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
                      <div className="flex items-center gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge 
                                variant={validation.isValid ? 'outline' : 'destructive'}
                                className="shrink-0"
                              >
                                {validation.isValid ? (
                                  <ShieldCheck className="w-3 h-3" />
                                ) : (
                                  <ShieldX className="w-3 h-3" />
                                )}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <div className="space-y-1 text-xs">
                                <div className={validation.cardNumber.valid ? 'text-green-500' : 'text-red-500'}>
                                  卡號: {validation.cardNumber.message}
                                </div>
                                <div className={validation.expiry.valid ? 'text-green-500' : 'text-red-500'}>
                                  有效期限: {validation.expiry.message}
                                </div>
                                <div className={validation.cvv.valid ? 'text-green-500' : 'text-red-500'}>
                                  CVV: {validation.cvv.message}
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
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
                      <div className="flex items-center gap-2">
                        <code className="text-sm">{card.number}</code>
                        {validation.cardNumber.valid ? (
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                        ) : (
                          <XCircle className="w-3 h-3 text-red-500" />
                        )}
                      </div>
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
                        <div className="flex items-center gap-2">
                          <code className="text-sm">{card.expiry}</code>
                          {validation.expiry.valid ? (
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                          ) : (
                            <XCircle className="w-3 h-3 text-red-500" />
                          )}
                        </div>
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
                        <div className="flex items-center gap-2">
                          <code className="text-sm">{card.cvv}</code>
                          {validation.cvv.valid ? (
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                          ) : (
                            <XCircle className="w-3 h-3 text-red-500" />
                          )}
                        </div>
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
              );
            })}
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

            {/* 測試按鈕 - 使用 Tabs 區分測試模式 */}
            <Tabs defaultValue="prime" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="prime">
                  <CreditCard className="w-4 h-4 mr-2" />
                  Prime Token
                </TabsTrigger>
                <TabsTrigger value="full">
                  <Zap className="w-4 h-4 mr-2" />
                  完整流程
                </TabsTrigger>
                <TabsTrigger value="linepay">
                  <Smartphone className="w-4 h-4 mr-2" />
                  LINE Pay
                </TabsTrigger>
                <TabsTrigger value="batch">
                  <PlayCircle className="w-4 h-4 mr-2" />
                  批次測試
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="prime" className="space-y-3 mt-4">
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
                      取得 Prime Token
                    </>
                  )}
                </Button>
                <p className="text-sm text-muted-foreground text-center">
                  僅測試 TapPay SDK 的 getPrime 功能，不會實際呼叫後端
                </p>
              </TabsContent>
              
              <TabsContent value="full" className="space-y-3 mt-4">
                <Button
                  onClick={testFullPayment}
                  disabled={!cardValid || isProcessing || !isTapPayReady}
                  className="w-full h-12 text-lg"
                  size="lg"
                  variant="default"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      處理中...
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5 mr-2" />
                      執行完整支付流程
                    </>
                  )}
                </Button>
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    <strong>測試內容：</strong>
                  </p>
                  <ul className="text-sm text-blue-600 dark:text-blue-300 mt-1 space-y-1 list-disc list-inside">
                    <li>取得 Prime Token</li>
                    <li>呼叫後端 process-tappay-payment</li>
                    <li>使用測試金額 NT$ 1,000</li>
                    <li>驗證完整支付流程</li>
                  </ul>
                </div>
              </TabsContent>

              <TabsContent value="linepay" className="space-y-4 mt-4">
                <Button
                  onClick={testLinePay}
                  disabled={isLinePayProcessing}
                  className="w-full h-12 text-lg bg-[#00C300] hover:bg-[#00B300]"
                  size="lg"
                >
                  {isLinePayProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      處理中...
                    </>
                  ) : (
                    <>
                      <Smartphone className="w-5 h-5 mr-2" />
                      測試 LINE Pay 付款
                    </>
                  )}
                </Button>
                
                <div className="p-3 bg-[#00C300]/10 border border-[#00C300]/20 rounded-lg">
                  <p className="text-sm font-medium text-[#00C300]">
                    <strong>LINE Pay 測試說明：</strong>
                  </p>
                  <ul className="text-sm text-[#00A300] mt-1 space-y-1 list-disc list-inside">
                    <li>呼叫後端 process-linepay-payment</li>
                    <li>使用測試金額 NT$ 1,000</li>
                    <li>取得 LINE Pay 付款連結</li>
                    <li>驗證 LINE Pay API 整合</li>
                  </ul>
                </div>

                {/* LINE Pay 測試結果 */}
                {linePayResult && (
                  <Card className={
                    linePayResult.success 
                      ? "border-[#00C300] bg-[#00C300]/5" 
                      : "border-red-500 bg-red-500/5"
                  }>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Smartphone className="w-4 h-4" />
                        LINE Pay 測試結果
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-start gap-3">
                        {linePayResult.success ? (
                          <CheckCircle2 className="w-5 h-5 text-[#00C300] shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 space-y-2">
                          <p className={`font-medium ${
                            linePayResult.success ? "text-[#00C300]" : "text-red-700 dark:text-red-400"
                          }`}>
                            {linePayResult.success ? "請求成功" : "請求失敗"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {linePayResult.message}
                          </p>
                          
                          {linePayResult.success && linePayResult.transactionId && (
                            <div className="p-2 bg-muted/50 rounded">
                              <p className="text-xs text-muted-foreground mb-1">交易 ID</p>
                              <code className="text-sm">{linePayResult.transactionId}</code>
                            </div>
                          )}
                          
                          {linePayResult.success && linePayResult.paymentUrl && (
                            <Button
                              asChild
                              className="w-full bg-[#00C300] hover:bg-[#00B300]"
                            >
                              <a 
                                href={linePayResult.paymentUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="w-4 h-4 mr-2" />
                                前往 LINE Pay 付款頁面
                              </a>
                            </Button>
                          )}
                          
                          {!linePayResult.success && (
                            <div className="space-y-2 mt-2">
                              {linePayResult.errorCode && (
                                <div className="p-2 bg-muted/50 rounded">
                                  <p className="text-xs text-muted-foreground mb-1">錯誤代碼</p>
                                  <code className="text-sm">{linePayResult.errorCode}</code>
                                </div>
                              )}
                              {linePayResult.errorCategory && (
                                <div className="p-2 bg-muted/50 rounded">
                                  <p className="text-xs text-muted-foreground mb-1">錯誤類型</p>
                                  <code className="text-sm">{linePayResult.errorCategory}</code>
                                </div>
                              )}
                              {linePayResult.suggestion && (
                                <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded">
                                  <p className="text-xs text-amber-700 dark:text-amber-400 mb-1">建議</p>
                                  <p className="text-sm text-amber-600 dark:text-amber-300">{linePayResult.suggestion}</p>
                                </div>
                              )}
                            </div>
                          )}
                          
                          <p className="text-xs text-muted-foreground mt-2">
                            時間：{linePayResult.time}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="batch" className="space-y-4 mt-4">
                {/* 批次測試控制區 */}
                <div className="flex gap-2">
                  <Button
                    onClick={runBatchTest}
                    disabled={isBatchTesting}
                    className="flex-1 h-12 text-lg"
                    size="lg"
                  >
                    {isBatchTesting ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        測試中 ({currentTestIndex + 1}/{testCards.length})
                      </>
                    ) : (
                      <>
                        <PlayCircle className="w-5 h-5 mr-2" />
                        一鍵測試所有卡號
                      </>
                    )}
                  </Button>
                  {batchTestCompleted && (
                    <>
                      <Button
                        onClick={exportTestReport}
                        variant="outline"
                        className="h-12"
                      >
                        <Download className="w-5 h-5 mr-2" />
                        匯出報告
                      </Button>
                      <Button
                        onClick={resetBatchTest}
                        variant="ghost"
                        className="h-12"
                      >
                        重置
                      </Button>
                    </>
                  )}
                </div>

                {/* 進度條 */}
                {(isBatchTesting || batchTestCompleted) && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>測試進度</span>
                      <span>{Math.round(batchProgress)}%</span>
                    </div>
                    <Progress value={batchProgress} className="h-2" />
                  </div>
                )}

                {/* 測試結果摘要 */}
                {batchTestCompleted && batchResults.length > 0 && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        測試報告摘要
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-2xl font-bold text-primary">{batchResults.length}</p>
                          <p className="text-xs text-muted-foreground">測試總數</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-green-500">
                            {batchResults.filter(r => r.validation.isValid).length}
                          </p>
                          <p className="text-xs text-muted-foreground">驗證通過</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-red-500">
                            {batchResults.filter(r => !r.validation.isValid).length}
                          </p>
                          <p className="text-xs text-muted-foreground">驗證失敗</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* 詳細測試結果 */}
                {batchResults.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">詳細測試結果</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[300px] pr-4">
                        <div className="space-y-3">
                          {batchResults.map((result, index) => (
                            <div 
                              key={index}
                              className={`p-3 rounded-lg border ${
                                result.validation.isValid 
                                  ? 'bg-green-500/5 border-green-500/20' 
                                  : 'bg-red-500/5 border-red-500/20'
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  {result.validation.isValid ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-red-500" />
                                  )}
                                  <span className="font-medium">{result.card.name}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Clock className="w-3 h-3" />
                                  {result.duration}ms
                                </div>
                              </div>
                              <div className="mt-2 text-sm text-muted-foreground">
                                <code className="text-xs">{result.card.number}</code>
                              </div>
                              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                                <div className={result.validation.cardNumber.valid ? 'text-green-600' : 'text-red-600'}>
                                  卡號: {result.validation.cardNumber.valid ? '✓' : '✗'}
                                </div>
                                <div className={result.validation.expiry.valid ? 'text-green-600' : 'text-red-600'}>
                                  效期: {result.validation.expiry.valid ? '✓' : '✗'}
                                </div>
                                <div className={result.validation.cvv.valid ? 'text-green-600' : 'text-red-600'}>
                                  CVV: {result.validation.cvv.valid ? '✓' : '✗'}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}

                {/* 說明 */}
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    <strong>批次測試說明：</strong>
                  </p>
                  <ul className="text-sm text-amber-600 dark:text-amber-300 mt-1 space-y-1 list-disc list-inside">
                    <li>自動驗證所有測試卡號格式 (Luhn 演算法)</li>
                    <li>檢查有效期限和 CVV 格式</li>
                    <li>產生詳細測試報告可下載</li>
                  </ul>
                </div>
              </TabsContent>
            </Tabs>
            
            {!isTapPayReady && (
              <p className="text-sm text-muted-foreground text-center mt-3">
                載入 TapPay SDK 中...
              </p>
            )}
            {isTapPayReady && !cardValid && (
              <p className="text-sm text-muted-foreground text-center mt-3">
                請填寫完整的信用卡資訊
              </p>
            )}

            {/* Prime Token 測試結果 */}
            {lastResult && (
              <Card className={
                lastResult.success 
                  ? "border-green-500 bg-green-500/5" 
                  : "border-red-500 bg-red-500/5"
              }>
                <CardHeader>
                  <CardTitle className="text-base">Prime Token 測試結果</CardTitle>
                </CardHeader>
                <CardContent>
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

            {/* 完整支付流程測試結果 */}
            {paymentTestResult && (
              <Card className={
                paymentTestResult.success 
                  ? "border-green-500 bg-green-500/5" 
                  : "border-red-500 bg-red-500/5"
              }>
                <CardHeader>
                  <CardTitle className="text-base">完整支付流程測試結果</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-start gap-3">
                    {paymentTestResult.success ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 space-y-2">
                      <p className={`font-medium ${
                        paymentTestResult.success ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                      }`}>
                        {paymentTestResult.success ? "支付成功" : "支付失敗"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {paymentTestResult.message}
                      </p>
                      
                      {paymentTestResult.success && paymentTestResult.transactionId && (
                        <div className="mt-2 p-2 bg-muted/50 rounded">
                          <p className="text-xs text-muted-foreground mb-1">交易 ID</p>
                          <code className="text-sm">{paymentTestResult.transactionId}</code>
                        </div>
                      )}
                      
                      {!paymentTestResult.success && (
                        <div className="space-y-2 mt-2">
                          {paymentTestResult.errorCode && (
                            <div className="p-2 bg-muted/50 rounded">
                              <p className="text-xs text-muted-foreground mb-1">錯誤代碼</p>
                              <code className="text-sm">{paymentTestResult.errorCode}</code>
                            </div>
                          )}
                          {paymentTestResult.technicalMessage && (
                            <div className="p-2 bg-muted/50 rounded">
                              <p className="text-xs text-muted-foreground mb-1">技術訊息</p>
                              <code className="text-sm text-wrap break-all">{paymentTestResult.technicalMessage}</code>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <p className="text-xs text-muted-foreground mt-2">
                        時間：{paymentTestResult.time}
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
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">基本流程</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>點擊上方的測試卡號卡片來查看詳細資訊</li>
                <li>使用複製按鈕快速複製卡號、有效期限和 CVV</li>
                <li>在表單中手動輸入信用卡資訊</li>
                <li>選擇測試模式：
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li><strong>Prime Token 測試：</strong>僅測試 TapPay SDK 的 getPrime 功能</li>
                    <li><strong>完整支付流程：</strong>測試完整的支付流程，包含後端 API 呼叫</li>
                    <li><strong>批次測試：</strong>一鍵測試所有測試卡號並產生報告</li>
                  </ul>
                </li>
                <li>點擊測試按鈕並查看結果</li>
              </ol>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold">測試模式說明</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className="w-4 h-4 text-primary" />
                    <strong className="text-sm">Prime Token</strong>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    僅測試前端卡片驗證和 Prime Token 取得功能，不會呼叫後端 API。
                  </p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-primary" />
                    <strong className="text-sm">完整流程</strong>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    測試完整支付流程，包含後端 API 與 TapPay 伺服器交互。
                  </p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <PlayCircle className="w-4 h-4 text-primary" />
                    <strong className="text-sm">批次測試</strong>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    自動驗證所有測試卡號格式，產生詳細測試報告可下載。
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-400">
                <strong>注意：</strong>此頁面僅用於開發測試環境（Sandbox），不會進行實際扣款。所有測試卡號均為 TapPay 提供的模擬卡號。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
