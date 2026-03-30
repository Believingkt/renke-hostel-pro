import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield, Server, Zap, CreditCard, FileText } from "lucide-react";
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
      "latitude": 24.6,
      "longitude": 121.7,
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
      desc: "取得民宿的房型列表（含照片、設備）",
      response: `{
  "room_types": [
    {
      "id": "uuid",
      "name": "豪華雙人房",
      "capacity": 4,
      "base_price": 6000,
      "photos": [...],
      "amenities": [...]
    }
  ]
}`,
    },
    {
      method: "POST",
      path: "/availability",
      desc: "查詢指定日期的空房與價格",
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
        { "date": "2026-05-01", "price": 6000, "price_2_meals": 7000, "price_3_meals": 8000 },
        { "date": "2026-05-02", "price": 6000, "price_2_meals": 7000, "price_3_meals": 8000 }
      ]
    }
  ]
}`,
    },
    {
      method: "POST",
      path: "/orders",
      desc: "建立點數訂房訂單（支援全額點數或點數+現金混合）",
      body: `{
  "accommodation_id": "uuid",
  "room_type_id": "uuid",
  "check_in_date": "2026-05-01",
  "check_out_date": "2026-05-03",
  "guest_name": "王小明",
  "guest_phone": "0912345678",
  "guest_email": "user@example.com",
  "guest_count": 2,
  "meal_plan": "一泊二食",         // 可選
  "points_amount": 10000,          // 使用的點數
  "cash_amount": 2000,             // 現金補差額（可選）
  "external_user_id": "user_123",  // 外部平台用戶ID
  "external_transaction_id": "txn_456", // 外部交易ID
  "notes": "備註"
}`,
      response: `{
  "order": {
    "id": "uuid",
    "order_number": "RK5M72B9",
    "total_price": 12000,
    "final_price": 12000,
    "payment_status": "paid",
    "order_status": "confirmed",
    "points_used": 10000,
    "points_currency": 10000,
    "cash_amount": 2000,
    "payment_method": "points_and_cash"
  }
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
    "check_in_date": "2026-05-01",
    "check_out_date": "2026-05-03",
    "order_status": "confirmed",
    "point_transaction": {
      "points_amount": 10000,
      "currency_amount": 10000,
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
  "refunded_points": 10000
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
                提供給會員點數平台串接，允許用戶使用點數（1 點 = 1 元）預訂人客多平台上所有合作民宿的房間。
                支援全額點數或點數 + 現金混合付款。
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
                    <p className="font-medium text-sm">混合付款</p>
                    <p className="text-xs text-muted-foreground">支援點數 + 現金</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Zap className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">即時扣款</p>
                    <p className="text-xs text-muted-foreground">建立訂單即完成扣款</p>
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
                <Server className="h-5 w-5" />
                串接流程
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
                  <span><strong>查詢民宿列表</strong> — GET /accommodations 取得所有合作民宿</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
                  <span><strong>查詢房型</strong> — GET /accommodations/:id/room-types 取得房型與定價</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</span>
                  <span><strong>檢查空房</strong> — POST /availability 確認指定日期的空房與價格</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">4</span>
                  <span><strong>建立訂單</strong> — POST /orders 使用點數（+現金）完成訂房</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">5</span>
                  <span><strong>查詢/取消</strong> — GET /orders/:id 或 POST /orders/:id/cancel</span>
                </li>
              </ol>
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
                    <pre className="bg-muted p-4 rounded text-xs overflow-x-auto">{ep.response}</pre>
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
              <CardDescription>若設定了 Webhook URL，系統會在訂單建立或取消時發送通知</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-medium mb-1">order.created</p>
                <pre className="bg-muted p-4 rounded text-xs overflow-x-auto">{`{
  "event": "order.created",
  "order_id": "uuid",
  "order_number": "RK5M72B9",
  "external_user_id": "user_123",
  "points_amount": 10000,
  "cash_amount": 2000,
  "total_price": 12000
}`}</pre>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">order.cancelled</p>
                <pre className="bg-muted p-4 rounded text-xs overflow-x-auto">{`{
  "event": "order.cancelled",
  "order_id": "uuid",
  "order_number": "RK5M72B9",
  "external_user_id": "user_123",
  "refund_points": 10000
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
