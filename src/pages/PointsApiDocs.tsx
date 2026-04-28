import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield, Server, Zap, CreditCard, FileText, Workflow } from "lucide-react";
import { Link } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";

const PointsApiDocs = () => {
  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/points-booking-api`;

  const endpoints = [
    {
      method: "GET",
      path: "/accommodations",
      desc: "取得所有啟用的民宿列表",
      response: `{
  "accommodations": [
    {
      "id": "uuid",
      "name": "森山寫照精品民宿",
      "description": "...",
      "address": "宜蘭縣...",
      "region_1": "宜蘭縣",
      "region_2": "冬山鄉",
      "photos": ["https://..."],
      "rating": 4.8,
      "review_count": 12
    }
  ]
}`,
    },
    {
      method: "GET",
      path: "/accommodations/:id",
      desc: "取得單一民宿詳細資訊（含照片、設施、評價）",
      response: `{
  "accommodation": {
    "id": "uuid",
    "name": "...",
    "photos": [...],
    "facilities": [...],
    "reviews": [...]
  }
}`,
    },
    {
      method: "GET",
      path: "/accommodations/:id/room-types",
      desc: "取得民宿的房型列表（含照片、設備、適用專案）",
      response: `{
  "room_types": [
    {
      "id": "uuid",
      "name": "豪華雙人房",
      "capacity": 4,
      "base_price": 6000,
      "photos": [...],
      "amenities": [...],
      "pricing_templates": [
        {
          "id": "uuid",
          "template_name": "一泊二食 - 平日",
          "price": 6000,
          "weekday_price": 6000,
          "peak_price": 7000,
          "weekend_price": 8000
        }
      ]
    }
  ]
}`,
    },
    {
      method: "GET",
      path: "/accommodations/:id/day-type-rules?year=2026",
      desc: "取得民宿的平假日規則（含國定假日與補班日）",
      response: `{
  "year": 2026,
  "rules": {
    "description": "平日為週日至週五（不含國定假日），假日為週六與國定假日。補班日視為平日。",
    "description_en": "Weekday = Sunday to Friday (excluding public holidays). Weekend = Saturday + public holidays. Compensatory workdays are treated as weekdays.",
    "weekend_days": ["Saturday"],
    "weekend_days_number": [6]
  },
  "public_holidays": [
    { "date": "2026-01-01", "name": "元旦" },
    { "date": "2026-02-16", "name": "除夕" },
    { "date": "2026-02-17", "name": "春節" }
  ],
  "compensatory_workdays": [
    { "date": "2026-02-14", "name": "補班日" }
  ]
}`,
    },
    {
      method: "POST",
      path: "/availability",
      desc: "查詢指定日期的空房與價格（含每日平假日類型）",
      body: `{
  "accommodation_id": "uuid",
  "check_in_date": "2026-05-01",
  "check_out_date": "2026-05-03",
  "room_type_id": "uuid"  // 可選，不帶則查全部房型
}`,
      response: `{
  "availability": [
    {
      "room_type_id": "uuid",
      "room_name": "豪華雙人房",
      "capacity": 4,
      "available": true,
      "available_rooms": 2,
      "nights": 2,
      "total_price": 12000,
      "daily_prices": [
        { "date": "2026-05-01", "price": 6000, "day_type": "weekday" },
        { "date": "2026-05-02", "price": 8000, "day_type": "weekend" }
      ]
    }
  ]
}`,
    },
    {
      method: "POST",
      path: "/orders",
      desc: "建立點數訂房訂單。點數先折抵總價，剩餘金額需以信用卡一次付清全額（已不再收取訂金）。",
      body: `{
  "accommodation_id": "uuid",
  "room_type_id": "uuid",
  "check_in_date": "2026-05-01",
  "check_out_date": "2026-05-03",
  "guest_name": "王小明",
  "guest_phone": "0912345678",
  "guest_email": "user@example.com",
  "guest_count": 2,
  "pricing_template_id": "uuid",      // 專案ID（從房型的 pricing_templates 取得）
  "points_amount": 5000,              // 使用的點數（1點=1元）
  "external_user_id": "user_123",     // 外部平台用戶ID
  "external_transaction_id": "txn_456", // 外部交易ID（可選）
  "notes": "備註"
}`,
      response: `{
  "order": {
    "id": "uuid",
    "order_number": "RK5M72B9",
    "total_price": 12000,
    "final_price": 12000,
    "points_used": 5000,
    "points_discount": 5000,
    "remaining_after_points": 7000,
    "amount_due_by_card": 7000,        // 需以信用卡支付的全額（無訂金）
    "requires_card_payment": true,
    "payment_status": "unpaid",        // 若點數完全覆蓋則為 "paid"
    "order_status": "pending",         // 若點數完全覆蓋則為 "confirmed"
    "payment_method": "points_and_card"
  }
}`,
    },
    {
      method: "POST",
      path: "/orders/:id/pay",
      desc: "使用信用卡支付剩餘全額。需先透過 TapPay SDK 取得 prime token。（舊路徑 /orders/:id/pay-deposit 仍可使用，行為相同 — 一律收取剩餘全額。）",
      body: `{
  "prime": "tappay_prime_token",
  "cardholder": {
    "name": "王小明",
    "email": "user@example.com",
    "phoneNumber": "0912345678"
  },
  "frontend_redirect_url": "https://your-site.com/payment-result",
  "backend_notify_url": "https://your-site.com/webhook"
}`,
      response: `// 成功（無需3D驗證）：
{
  "success": true,
  "requires_3d_secure": false,
  "rec_trade_id": "D20260501...",
  "amount": 7000,
  "message": "付款成功"
}

// 需要3D驗證：
{
  "success": true,
  "requires_3d_secure": true,
  "payment_url": "https://...",
  "amount": 7000,
  "message": "需要進行 3D 驗證"
}`,
    },
    {
      method: "GET",
      path: "/tappay-config",
      desc: "取得 TapPay SDK 前端設定（App ID、App Key、環境）",
      response: `{
  "app_id": 12345,
  "app_key": "app_key_string",
  "env": "sandbox",
  "sdk_url": "https://js.tappaysdk.com/sdk/tpdirect/v5.18.0"
}`,
    },
    {
      method: "GET",
      path: "/orders/:id",
      desc: "查詢訂單狀態（僅限該平台建立的訂單）",
      response: `{
  "order": {
    "id": "uuid",
    "order_number": "RK5M72B9",
    "accommodation_name": "森山寫照精品民宿",
    "room_type_name": "豪華雙人房",
    "total_price": 12000,
    "final_price": 12000,
    "points_discount": 5000,
    "remaining_after_points": 7000,
    "paid_amount": 12000,
    "payment_status": "paid",
    "order_status": "confirmed",
    "point_transaction": {
      "points_amount": 5000,
      "currency_amount": 5000,
      "status": "completed"
    }
  }
}`,
    },
    {
      method: "POST",
      path: "/orders/:id/cancel",
      desc: "取消訂單並退還點數",
      response: `{
  "message": "Order cancelled successfully",
  "order_id": "uuid",
  "order_number": "RK5M72B9",
  "refunded_points": 5000
}`,
    },
  ];

  return (
    <>
      <SEOHead
        title="點數訂房 API 文件 | Points Booking API"
        description="點數平台串接 API 文件 - 使用會員點數預訂合作民宿房間"
      />
      <div className="min-h-screen bg-background">
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
                  <h1 className="text-xl font-bold">點數訂房 API 文件</h1>
                  <p className="text-sm text-muted-foreground">Points Booking API Documentation</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="container mx-auto px-4 py-8 max-w-4xl space-y-8">
          {/* Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                API 概述
              </CardTitle>
              <CardDescription>
                提供給會員點數平台串接，允許用戶使用點數（1 點 = 1 元）折抵訂房總價，
                剩餘全額透過信用卡（TapPay）一次付清（已不再收取訂金）。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">Base URL</p>
                <code className="text-sm bg-muted px-3 py-2 rounded block break-all">{baseUrl}</code>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-start gap-2">
                  <Shield className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">API Key 認證</p>
                    <p className="text-xs text-muted-foreground">透過 x-platform-key 標頭驗證</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CreditCard className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">點數 + 刷卡全額</p>
                    <p className="text-xs text-muted-foreground">點數折抵後，剩餘以信用卡付清</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Zap className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">即時扣點</p>
                    <p className="text-xs text-muted-foreground">建立訂單即扣除點數</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Auth */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                認證方式
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">所有請求都必須在 HTTP Header 中帶入 API Key：</p>
              <pre className="bg-muted p-4 rounded text-sm overflow-x-auto">{`x-platform-key: your_api_key_here
Content-Type: application/json`}</pre>
              <p className="text-sm text-muted-foreground">
                API Key 由人客多管理員建立合作夥伴時自動產生，請妥善保管。
              </p>
            </CardContent>
          </Card>

          {/* Flow */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="h-5 w-5" />
                串接流程
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
                  <span><strong>查詢民宿與房型</strong> — GET /accommodations → GET /accommodations/:id/room-types（含各房型適用專案與平假日價格）</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1.5</span>
                  <span><strong>取得平假日規則</strong> — GET /accommodations/:id/day-type-rules?year=2026（取得國定假日、補班日清單）</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
                  <span><strong>檢查空房</strong> — POST /availability 確認指定日期的空房與價格</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</span>
                  <span><strong>建立訂單</strong> — POST /orders 使用點數折抵，取得 amount_due_by_card（需刷卡的全額）</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">4</span>
                  <span><strong>取得刷卡設定</strong> — GET /tappay-config 取得 TapPay SDK 前端金鑰</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">5</span>
                  <span><strong>前端取得 Prime</strong> — 在星鏈頁面載入 TapPay SDK，取得信用卡 prime token</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">6</span>
                  <span><strong>支付全額</strong> — POST /orders/:id/pay 以 prime 一次支付剩餘全額</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">7</span>
                  <span><strong>完成</strong> — 付款成功後，訂單自動標記為已付清並確認</span>
                </li>
              </ol>
            </CardContent>
          </Card>

          {/* Pricing Logic */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                計價邏輯
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-muted p-4 rounded text-sm space-y-2">
                <p><strong>1.</strong> 訂房總價 = 專案定價 × 晚數（若專案價格為 0 則改用庫存每日定價加總）</p>
                <p><strong>2.</strong> 點數折抵 = 使用點數 × 兌換比率（預設 1:1）</p>
                <p><strong>3.</strong> 剩餘金額 = 訂房總價 - 點數折抵</p>
                <p><strong>4.</strong> 剩餘金額需以信用卡（TapPay）一次付清全額（不再收取訂金）</p>
              </div>
              <div className="bg-muted p-4 rounded text-sm space-y-2">
                <p className="font-medium mb-1">⚡ 三段式價格規則</p>
                <p>• <strong>平日</strong>：週一～週四</p>
                <p>• <strong>旺日</strong>：週五、週日（不含國定假日）</p>
                <p>• <strong>假日</strong>：週六 + 國定假日（補班日視為平日）</p>
                <p>• 專案模板可設定 <code>weekday_price</code>、<code>peak_price</code>、<code>weekend_price</code> 供前端參考</p>
                <p>• 查詢空房（POST /availability）回傳的 <code>daily_prices</code> 會包含每日的 <code>day_type</code>（weekday / peak / weekend / holiday）</p>
                <p>• 可透過 <code>GET /accommodations/:id/day-type-rules?year=2026</code> 取得完整的國定假日與補班日清單</p>
              </div>
              <div className="bg-muted p-4 rounded text-sm">
                <p className="font-medium mb-2">範例：</p>
                <p>訂房總價：NT$ 12,000</p>
                <p>使用 5,000 點 → 折抵 NT$ 5,000</p>
                <p>剩餘金額：NT$ 7,000</p>
                <p>需刷卡全額 = NT$ 7,000（一次付清）</p>
              </div>
              <p className="text-xs text-muted-foreground">
                ※ 若點數完全覆蓋總價，則無需刷卡，訂單直接標記為已付清並確認。
              </p>
            </CardContent>
          </Card>

          {/* Endpoints */}
          <div className="space-y-6">
            <h2 className="text-lg font-bold">API 端點</h2>
            {endpoints.map((ep, i) => (
              <Card key={i}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-base">
                    <span className={`px-2 py-1 rounded text-xs font-mono font-bold ${
                      ep.method === "GET" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                        : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    }`}>
                      {ep.method}
                    </span>
                    <code className="text-sm">{ep.path}</code>
                  </CardTitle>
                  <CardDescription>{ep.desc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ep.body && (
                    <div>
                      <p className="text-sm font-medium mb-1">Request Body</p>
                      <pre className="bg-muted p-4 rounded text-xs overflow-x-auto">{ep.body}</pre>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium mb-1">Response</p>
                    <pre className="bg-muted p-4 rounded text-xs overflow-x-auto whitespace-pre-wrap">{ep.response}</pre>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Error codes */}
          <Card>
            <CardHeader>
              <CardTitle>錯誤碼</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3">HTTP Status</th>
                      <th className="text-left py-2 px-3">說明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["400", "請求參數錯誤或無可用房間"],
                      ["401", "API Key 缺失或無效"],
                      ["403", "合作夥伴帳號已停用"],
                      ["404", "資源不存在"],
                      ["500", "伺服器內部錯誤"],
                    ].map(([code, desc]) => (
                      <tr key={code} className="border-b">
                        <td className="py-2 px-3 font-mono">{code}</td>
                        <td className="py-2 px-3">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Webhook */}
          <Card>
            <CardHeader>
              <CardTitle>Webhook 通知</CardTitle>
              <CardDescription>若設定了 Webhook URL，系統會在訂單狀態變更時發送通知</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-medium mb-1">order.created（訂單建立，等待刷卡）</p>
                <pre className="bg-muted p-4 rounded text-xs overflow-x-auto">{`{
  "event": "order.created",
  "order_id": "uuid",
  "order_number": "RK5M72B9",
  "external_user_id": "user_123",
  "total_price": 12000,
  "points_discount": 5000,
  "remaining_after_points": 7000,
  "deposit_amount": 2100,
  "requires_card_payment": true
}`}</pre>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">deposit.paid（訂金刷卡成功）</p>
                <pre className="bg-muted p-4 rounded text-xs overflow-x-auto">{`{
  "event": "deposit.paid",
  "order_id": "uuid",
  "order_number": "RK5M72B9",
  "deposit_amount": 2100,
  "rec_trade_id": "D20260501..."
}`}</pre>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">order.cancelled（訂單取消，退還點數）</p>
                <pre className="bg-muted p-4 rounded text-xs overflow-x-auto">{`{
  "event": "order.cancelled",
  "order_id": "uuid",
  "order_number": "RK5M72B9",
  "external_user_id": "user_123",
  "refund_points": 5000
}`}</pre>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default PointsApiDocs;
