import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Code, Shield, ArrowLeft, ExternalLink, FileText, Zap, Lock, Server } from "lucide-react";
import { Link } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";

const KolApiDocs = () => {
  return (
    <>
      <SEOHead
        title="網紅導購 API 文件 | KOL API Documentation"
        description="網紅導購 API 使用說明 - 透過 API 端點查詢訂單、統計數據和佣金記錄"
      />
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link to="/">
                  <Button variant="ghost" size="sm" className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    返回首頁
                  </Button>
                </Link>
                <div>
                  <h1 className="text-xl font-bold">網紅導購 API 文件</h1>
                  <p className="text-sm text-muted-foreground">KOL API Documentation</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Introduction */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                API 概述
              </CardTitle>
              <CardDescription>
                透過以下 API 端點，網紅可以在自己的網站查詢訂單和佣金數據
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                  <Server className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">RESTful API</p>
                    <p className="text-sm text-muted-foreground">標準 REST 介面</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                  <Lock className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">API Key 驗證</p>
                    <p className="text-sm text-muted-foreground">安全的金鑰認證</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                  <Zap className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">即時數據</p>
                    <p className="text-sm text-muted-foreground">100-500ms 回應</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-8">
            {/* Base URL */}
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Code className="h-5 w-5" />
                API Base URL
              </h2>
              <code className="block p-4 bg-muted rounded-lg text-sm font-mono break-all">
                https://sensaninn.lakeze.com/functions/v1/kol-api
              </code>
            </section>

            <Separator />

            {/* Authentication */}
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Shield className="h-5 w-5" />
                API 金鑰驗證
              </h2>
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg mb-4">
                <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
                  <strong>重要：</strong>所有 API 請求都需要提供 API 金鑰進行驗證
                </p>
                <p className="text-xs text-muted-foreground">
                  每個折扣碼都有唯一的 API 金鑰，請聯繫管理員取得您的專屬金鑰
                </p>
              </div>
              <div className="space-y-3">
                <Label className="text-sm text-muted-foreground">驗證方式（二選一）</Label>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm font-medium mb-1">方式一：HTTP Header（推薦）</p>
                    <code className="text-xs bg-background p-1 rounded">x-api-key: YOUR_API_KEY</code>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm font-medium mb-1">方式二：URL 參數</p>
                    <code className="text-xs bg-background p-1 rounded">?api_key=YOUR_API_KEY</code>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <Label className="text-sm text-muted-foreground">速率限制</Label>
                <div className="mt-2 grid sm:grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between p-2 bg-background rounded">
                    <span className="text-muted-foreground">每個 API Key</span>
                    <span className="font-medium">100 請求/小時</span>
                  </div>
                  <div className="flex justify-between p-2 bg-background rounded">
                    <span className="text-muted-foreground">每個折扣碼</span>
                    <span className="font-medium">10 請求/小時</span>
                  </div>
                </div>
              </div>
            </section>

            <Separator />

            {/* Endpoint 1: Query Orders */}
            <section>
              <h2 className="text-lg font-semibold mb-4">1. 查詢訂單列表</h2>
              <div className="space-y-4">
                <div>
                  <Label className="text-sm text-muted-foreground">端點</Label>
                  <code className="block p-3 bg-muted rounded-lg text-sm font-mono mt-1">
                    GET /orders?code=YOUR_DISCOUNT_CODE&api_key=YOUR_API_KEY
                  </code>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">範例請求</Label>
                  <pre className="mt-1 p-4 bg-muted rounded-lg text-xs font-mono overflow-x-auto">
{`fetch('https://sensaninn.lakeze.com/functions/v1/kol-api/orders?code=SPRING2024&api_key=kol_xxxxx', {
  headers: {
    'x-api-key': 'kol_xxxxx' // 或使用 URL 參數
  }
})
  .then(res => res.json())
  .then(data => console.log(data));`}
                  </pre>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">回應範例</Label>
                  <pre className="mt-1 p-4 bg-muted rounded-lg text-xs font-mono overflow-x-auto">
{`{
  "success": true,
  "discount_code": "SPRING2024",
  "orders": [
    {
      "id": "...",
      "order_number": "20240115001",
      "order_date": "2024-01-15T10:30:00",
      "check_in_date": "2024-02-01",
      "check_out_date": "2024-02-03",
      "guest_name": "王小明",
      "guest_count": 2,
      "order_status": "confirmed",
      "payment_status": "paid",
      "total_price": 5000,
      "discount_amount": 500,
      "final_price": 4500,
      "paid_amount": 4500,
      "room_types": {
        "name": "標準雙人房"
      }
    }
  ]
}`}
                  </pre>
                </div>
              </div>
            </section>

            <Separator />

            {/* Endpoint 2: Query Statistics */}
            <section>
              <h2 className="text-lg font-semibold mb-4">2. 查詢統計數據</h2>
              <div className="space-y-4">
                <div>
                  <Label className="text-sm text-muted-foreground">端點</Label>
                  <code className="block p-3 bg-muted rounded-lg text-sm font-mono mt-1">
                    GET /stats?code=YOUR_DISCOUNT_CODE&api_key=YOUR_API_KEY
                  </code>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">範例請求</Label>
                  <pre className="mt-1 p-4 bg-muted rounded-lg text-xs font-mono overflow-x-auto">
{`fetch('https://sensaninn.lakeze.com/functions/v1/kol-api/stats?code=SPRING2024&api_key=kol_xxxxx')
  .then(res => res.json())
  .then(data => console.log(data));`}
                  </pre>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">回應範例</Label>
                  <pre className="mt-1 p-4 bg-muted rounded-lg text-xs font-mono overflow-x-auto">
{`{
  "success": true,
  "discount_code": "SPRING2024",
  "discount_info": {
    "name": "春季促銷",
    "discount_type": "percentage",
    "discount_value": 10,
    "used_count": 25,
    "usage_limit": 100,
    "is_active": true
  },
  "statistics": {
    "total_orders": 25,
    "confirmed_orders": 23,
    "total_revenue": 115000,
    "total_discount": 11500,
    "estimated_commission": 1150,
    "commission_rate": 0.1
  }
}`}
                  </pre>
                </div>
              </div>
            </section>

            <Separator />

            {/* Endpoint 3: Query Commission */}
            <section>
              <h2 className="text-lg font-semibold mb-4">3. 查詢佣金記錄</h2>
              <div className="space-y-4">
                <div>
                  <Label className="text-sm text-muted-foreground">端點</Label>
                  <code className="block p-3 bg-muted rounded-lg text-sm font-mono mt-1">
                    GET /commission?code=YOUR_DISCOUNT_CODE&api_key=YOUR_API_KEY
                  </code>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">範例請求</Label>
                  <pre className="mt-1 p-4 bg-muted rounded-lg text-xs font-mono overflow-x-auto">
{`fetch('https://sensaninn.lakeze.com/functions/v1/kol-api/commission?code=SPRING2024&api_key=kol_xxxxx')
  .then(res => res.json())
  .then(data => console.log(data));`}
                  </pre>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">回應範例</Label>
                  <pre className="mt-1 p-4 bg-muted rounded-lg text-xs font-mono overflow-x-auto">
{`{
  "success": true,
  "discount_code": "SPRING2024",
  "commission_statistics": {
    "total_records": 23,
    "total_commission": 1150,
    "pending_commission": 230,
    "approved_commission": 460,
    "paid_commission": 460,
    "commission_rate": 10
  },
  "commission_records": [
    {
      "id": "...",
      "order_number": "20240115001",
      "guest_name": "王小明",
      "check_in_date": "2024-02-01",
      "order_status": "confirmed",
      "order_total": 5000,
      "discount_amount": 500,
      "commission_rate": 10,
      "commission_amount": 50,
      "settlement_status": "paid",
      "settlement_date": "2024-01-20T10:00:00Z",
      "payment_date": "2024-01-25T15:30:00Z",
      "created_at": "2024-01-15T14:30:00Z"
    }
  ]
}`}
                  </pre>
                </div>
              </div>
            </section>

            <Separator />

            {/* Error Handling */}
            <section>
              <h2 className="text-lg font-semibold mb-4">錯誤處理</h2>
              <div className="space-y-4">
                <div>
                  <Label className="text-sm text-muted-foreground">完整錯誤處理範例（JavaScript）</Label>
                  <pre className="mt-1 p-4 bg-muted rounded-lg text-xs font-mono overflow-x-auto">
{`async function getOrderData(discountCode, apiKey) {
  try {
    const response = await fetch(
      \`https://sensaninn.lakeze.com/functions/v1/kol-api/orders?code=\${discountCode}&api_key=\${apiKey}\`
    );
    
    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      console.error('API 錯誤:', data.error);
      return null;
    }
    
    return data.orders;
  } catch (error) {
    console.error('請求失敗:', error);
    alert('無法載入訂單資料，請稍後再試');
    return null;
  }
}`}
                  </pre>
                </div>

                <div>
                  <Label className="text-sm text-muted-foreground">錯誤回應格式</Label>
                  <pre className="mt-1 p-4 bg-muted rounded-lg text-xs font-mono overflow-x-auto">
{`{
  "success": false,
  "error": "驗證失敗"
}`}
                  </pre>
                </div>

                <div>
                  <Label className="text-sm text-muted-foreground">HTTP 狀態碼</Label>
                  <div className="mt-2 space-y-2 text-sm">
                    <div className="p-3 bg-muted rounded-lg flex justify-between items-center">
                      <span className="font-mono">400 Bad Request</span>
                      <span className="text-muted-foreground">缺少必要參數（code）</span>
                    </div>
                    <div className="p-3 bg-muted rounded-lg flex justify-between items-center">
                      <span className="font-mono">401 Unauthorized</span>
                      <span className="text-muted-foreground">API 金鑰無效或缺失</span>
                    </div>
                    <div className="p-3 bg-muted rounded-lg flex justify-between items-center">
                      <span className="font-mono">429 Too Many Requests</span>
                      <span className="text-muted-foreground">請求過於頻繁</span>
                    </div>
                    <div className="p-3 bg-muted rounded-lg flex justify-between items-center">
                      <span className="font-mono">500 Internal Server Error</span>
                      <span className="text-muted-foreground">伺服器錯誤，請稍後重試</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <Separator />

            {/* Other Language Examples */}
            <section>
              <h2 className="text-lg font-semibold mb-4">其他程式語言範例</h2>
              <div className="space-y-4">
                <div>
                  <Label className="text-sm text-muted-foreground">Python 範例</Label>
                  <pre className="mt-1 p-4 bg-muted rounded-lg text-xs font-mono overflow-x-auto">
{`import requests

def get_stats(discount_code, api_key):
    url = "https://sensaninn.lakeze.com/functions/v1/kol-api/stats"
    params = {"code": discount_code, "api_key": api_key}
    
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        if data.get("success"):
            return data.get("statistics")
        else:
            print(f"錯誤: {data.get('error')}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"請求失敗: {e}")
        return None`}
                  </pre>
                </div>

                <div>
                  <Label className="text-sm text-muted-foreground">PHP 範例</Label>
                  <pre className="mt-1 p-4 bg-muted rounded-lg text-xs font-mono overflow-x-auto">
{`<?php
function getCommissionData($discountCode, $apiKey) {
    $url = "https://sensaninn.lakeze.com/functions/v1/kol-api/commission";
    $url .= "?code=" . urlencode($discountCode);
    $url .= "&api_key=" . urlencode($apiKey);
    
    $response = file_get_contents($url);
    if ($response === false) {
        return null;
    }
    
    $data = json_decode($response, true);
    
    if ($data['success']) {
        return $data['commission_records'];
    } else {
        error_log("API 錯誤: " . $data['error']);
        return null;
    }
}
?>`}
                  </pre>
                </div>

                <div>
                  <Label className="text-sm text-muted-foreground">jQuery 範例</Label>
                  <pre className="mt-1 p-4 bg-muted rounded-lg text-xs font-mono overflow-x-auto">
{`$.ajax({
  url: 'https://sensaninn.lakeze.com/functions/v1/kol-api/stats',
  method: 'GET',
  data: { code: 'SPRING2024', api_key: 'kol_xxxxx' },
  success: function(data) {
    if (data.success) {
      console.log('統計數據:', data.statistics);
      $('#total-orders').text(data.statistics.total_orders);
      $('#total-revenue').text('NT$ ' + data.statistics.total_revenue);
    } else {
      console.error('錯誤:', data.error);
    }
  },
  error: function(xhr, status, error) {
    console.error('請求失敗:', error);
    alert('無法載入數據，請稍後再試');
  }
});`}
                  </pre>
                </div>
              </div>
            </section>

            <Separator />

            {/* Webhook */}
            <section>
              <h2 className="text-lg font-semibold mb-4">Webhook 即時通知</h2>
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg mb-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  當有使用您折扣碼的新訂單成立時，系統會自動發送 Webhook 通知到您設定的 URL
                </p>
              </div>
              
              <div className="space-y-4">
                <div>
                  <Label className="text-sm text-muted-foreground">Webhook 請求格式</Label>
                  <p className="text-xs text-muted-foreground mb-2">系統會發送 POST 請求到您的 Webhook URL</p>
                  <pre className="p-4 bg-muted rounded-lg text-xs font-mono overflow-x-auto">
{`POST https://your-webhook-url.com/endpoint
Content-Type: application/json
X-Webhook-Signature: sha256=xxxxxx...
X-Webhook-Timestamp: 1735123456789

{
  "event": "order.created",
  "timestamp": "2024-12-25T10:30:00.000Z",
  "discount_code": "SPRING2024",
  "order": {
    "order_number": "20241225001",
    "order_date": "2024-12-25",
    "check_in_date": "2025-01-15",
    "check_out_date": "2025-01-17",
    "guest_name": "王小明",
    "guest_count": 2,
    "room_type": "標準雙人房",
    "total_price": 5000,
    "discount_amount": 500,
    "final_price": 4500
  }
}`}
                  </pre>
                </div>

                <div>
                  <Label className="text-sm text-muted-foreground">簽名驗證</Label>
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg my-2">
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      <strong>重要：</strong>請務必驗證簽名以防止偽造請求
                    </p>
                  </div>
                  <pre className="p-4 bg-muted rounded-lg text-xs font-mono overflow-x-auto">
{`// Node.js 簽名驗證範例
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, timestamp, secret) {
  // 1. 檢查時間戳（防止重放攻擊，建議 5 分鐘內有效）
  const now = Date.now();
  if (Math.abs(now - parseInt(timestamp)) > 5 * 60 * 1000) {
    return false;
  }
  
  // 2. 計算期望的簽名
  const signaturePayload = timestamp + '.' + JSON.stringify(payload);
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(signaturePayload)
    .digest('hex');
  
  // 3. 比較簽名（使用時序安全比較）
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}`}
                  </pre>
                </div>

                <div>
                  <Label className="text-sm text-muted-foreground">Webhook 回應要求</Label>
                  <div className="mt-2 space-y-2 text-sm">
                    <div className="p-3 bg-muted rounded-lg flex justify-between items-center">
                      <span>成功回應</span>
                      <span className="text-muted-foreground">HTTP 200-299 狀態碼</span>
                    </div>
                    <div className="p-3 bg-muted rounded-lg flex justify-between items-center">
                      <span>逾時設定</span>
                      <span className="text-muted-foreground">10 秒內回應</span>
                    </div>
                    <div className="p-3 bg-muted rounded-lg flex justify-between items-center">
                      <span>重試機制</span>
                      <span className="text-muted-foreground">1分、5分、30分後重試（最多3次）</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <Separator />

            {/* Best Practices */}
            <section>
              <h2 className="text-lg font-semibold mb-4">最佳實踐建議</h2>
              <div className="grid gap-3">
                <div className="p-4 bg-muted rounded-lg">
                  <strong className="text-foreground">1. 實作快取機制</strong>
                  <p className="text-sm text-muted-foreground mt-1">
                    建議快取統計數據 5-10 分鐘，減少伺服器負擔並提升頁面載入速度
                  </p>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <strong className="text-foreground">2. 友善的錯誤提示</strong>
                  <p className="text-sm text-muted-foreground mt-1">
                    向用戶顯示清楚的錯誤訊息，而不是技術性的錯誤代碼
                  </p>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <strong className="text-foreground">3. 載入狀態指示</strong>
                  <p className="text-sm text-muted-foreground mt-1">
                    在請求期間顯示載入動畫，提升用戶體驗
                  </p>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <strong className="text-foreground">4. 定期重試機制</strong>
                  <p className="text-sm text-muted-foreground mt-1">
                    網路暫時失敗時，自動重試 2-3 次後再顯示錯誤
                  </p>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <strong className="text-foreground">5. 安全保管金鑰</strong>
                  <p className="text-sm text-muted-foreground mt-1">
                    請妥善保管您的 API 金鑰和 Webhook 密鑰，避免洩露給非授權人員
                  </p>
                </div>
              </div>
            </section>

            <Separator />

            {/* Platform Management API */}
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Server className="h-5 w-5" />
                平台管理 API（合作平台專用）
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                合作平台可透過平台主金鑰 (x-platform-key) 管理網紅的 API Key。所有管理端點需在請求頭中加入 <code className="bg-muted px-1 py-0.5 rounded text-xs">x-platform-key</code>。
              </p>

              <div className="space-y-4">
                {/* Generate Key */}
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-green-600 text-white text-xs px-2 py-0.5 rounded font-mono">POST</span>
                    <code className="text-sm font-mono">/kol-api/manage/keys</code>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">為指定折扣碼生成 API Key</p>
                  <p className="text-xs text-muted-foreground">Body: <code>{`{"code": "DISCOUNT_CODE"}`}</code></p>
                  <p className="text-xs text-muted-foreground mt-1">回應包含: code, name, api_key</p>
                </div>

                {/* Get Key */}
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded font-mono">GET</span>
                    <code className="text-sm font-mono">/kol-api/manage/keys?code=DISCOUNT_CODE</code>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">查詢指定折扣碼的 API Key</p>
                  <p className="text-xs text-muted-foreground">回應包含: code, name, api_key, has_key</p>
                </div>

                {/* Revoke Key */}
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded font-mono">DELETE</span>
                    <code className="text-sm font-mono">/kol-api/manage/keys?code=DISCOUNT_CODE</code>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">撤銷指定折扣碼的 API Key</p>
                </div>

                {/* List Codes */}
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded font-mono">GET</span>
                    <code className="text-sm font-mono">/kol-api/manage/codes</code>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">列出所有折扣碼及 API Key 狀態</p>
                  <p className="text-xs text-muted-foreground">回應包含: codes[] (code, name, has_api_key, ...)</p>
                </div>
              </div>

              <div className="mt-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">⚠️ 安全提醒</p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  平台主金鑰具有最高管理權限，請嚴格限制存取範圍，僅在伺服器端使用，切勿在前端暴露。
                </p>
              </div>
            </section>

            <Separator />

            {/* Notes */}
            <section>
              <h2 className="text-lg font-semibold mb-4">注意事項</h2>
              <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                <li>所有 API 請求都需要有效的 API 金鑰進行驗證</li>
                <li>回應格式為 JSON</li>
                <li>佣金根據折扣碼設定的佣金率自動計算</li>
                <li>結算狀態：pending（待結算）、approved（已核准）、paid（已付款）、cancelled（已取消）</li>
                <li>建議在外部網站實作快取機制，避免頻繁請求</li>
                <li>API 支援 CORS，可直接從瀏覽器調用</li>
                <li>API 回應時間通常在 100-500ms 之間</li>
                <li>Webhook 通知為即時發送，建議設定穩定的接收端點</li>
                <li>平台管理 API 需使用獨立的平台主金鑰 (x-platform-key) 驗證</li>
              </ul>
            </section>
          </div>

          {/* Footer */}
          <div className="mt-12 pt-8 border-t text-center">
            <p className="text-sm text-muted-foreground">
              如有任何問題，請聯繫管理員
            </p>
          </div>
        </main>
      </div>
    </>
  );
};

export default KolApiDocs;
