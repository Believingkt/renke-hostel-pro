import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText, Lock, Server, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";

const BASE_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/accommodation-api`;

const Code = ({ children }: { children: React.ReactNode }) => (
  <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-xs leading-relaxed">
    <code>{children}</code>
  </pre>
);

export default function AccommodationApiDocs() {
  return (
    <>
      <SEOHead
        title="民宿房型 API 文件 | Accommodation API"
        description="供各民宿透過 API 新增與查詢房型資料的開發文件"
      />
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4 flex items-center gap-4">
            <Link to="/hq?tab=system&section=api-keys">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" /> 返回
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold">民宿房型 API 文件</h1>
              <p className="text-sm text-muted-foreground">Accommodation Room Types API</p>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 max-w-4xl space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />API 概述</CardTitle>
              <CardDescription>各民宿可透過此 API 在自家後端管理房型資料</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                  <Server className="h-5 w-5 text-primary mt-0.5" />
                  <div><p className="font-medium">RESTful</p><p className="text-sm text-muted-foreground">JSON over HTTPS</p></div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                  <Lock className="h-5 w-5 text-primary mt-0.5" />
                  <div><p className="font-medium">API Key 驗證</p><p className="text-sm text-muted-foreground">x-api-key Header</p></div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                  <Zap className="h-5 w-5 text-primary mt-0.5" />
                  <div><p className="font-medium">即時生效</p><p className="text-sm text-muted-foreground">寫入即同步前台</p></div>
                </div>
              </div>
            </CardContent>
          </Card>

          <section>
            <h2 className="text-lg font-semibold mb-3">Base URL</h2>
            <Code>{BASE_URL}</Code>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">驗證</h2>
            <p className="text-sm text-muted-foreground mb-3">
              於 HTTP Header 帶入金鑰。金鑰僅供該民宿使用，請妥善保管，切勿暴露於前端程式碼。
            </p>
            <Code>{`x-api-key: acc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</Code>
            <p className="text-sm text-muted-foreground mt-2">
              亦支援 <code className="bg-muted px-1 rounded">Authorization: Bearer &lt;key&gt;</code>。
            </p>
          </section>

          <section className="space-y-6">
            <h2 className="text-lg font-semibold">端點 Endpoints</h2>

            {/* List */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">GET</Badge>
                  <code className="text-sm">/room-types</code>
                </div>
                <CardDescription>列出此民宿所有房型（含設施與圖片）</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Code>{`curl -X GET '${BASE_URL}/room-types' \\
  -H 'x-api-key: YOUR_API_KEY'`}</Code>
              </CardContent>
            </Card>

            {/* Get by id */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">GET</Badge>
                  <code className="text-sm">/room-types/:id</code>
                </div>
                <CardDescription>取得單一房型詳情</CardDescription>
              </CardHeader>
              <CardContent>
                <Code>{`curl -X GET '${BASE_URL}/room-types/<ROOM_TYPE_ID>' \\
  -H 'x-api-key: YOUR_API_KEY'`}</Code>
              </CardContent>
            </Card>

            {/* Create */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Badge>POST</Badge>
                  <code className="text-sm">/room-types</code>
                </div>
                <CardDescription>新增房型，可同時帶入設施與圖片</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="font-medium text-sm mb-2">請求 Body</p>
                  <Code>{`{
  "name": "海景雙人房",            // 必填，1-50 字
  "name_en": "Ocean View Double",  // 選填
  "description": "面海景觀套房",   // 選填
  "capacity": 2,                    // 必填，1-50
  "base_price": 3800,               // 必填，>= 0（NTD）
  "room_count": 3,                  // 選填，預設 1
  "size_sqm": 12.5,                 // 選填（坪）
  "double_room_count": 1,           // 選填
  "triple_room_count": 0,           // 選填
  "quad_room_count": 0,             // 選填
  "is_exclusive_package": false,    // 選填，是否為包棟房型
  "is_bound_to_exclusive": false,   // 選填，是否綁定包棟
  "display_order": 0,               // 選填

  "amenities": [                    // 選填，房型設施
    { "category": "general", "amenity_name": "空調" },
    { "category": "bathroom", "amenity_name": "淋浴" }
  ],

  "photos": [                       // 選填，房型圖片（兩種方式擇一）
    // 方式 1：直接提供已公開的圖片 URL
    { "photo_url": "https://...", "display_order": 0 },
    // 方式 2：base64 上傳（系統存入內建儲存空間並產生公開 URL）
    {
      "photo_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
      "display_order": 1
    }
  ]
}`}</Code>
                </div>

                <div>
                  <p className="font-medium text-sm mb-2">cURL 範例</p>
                  <Code>{`curl -X POST '${BASE_URL}/room-types' \\
  -H 'x-api-key: YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "name": "海景雙人房",
    "capacity": 2,
    "base_price": 3800,
    "room_count": 3,
    "amenities": [
      { "category": "general", "amenity_name": "空調" }
    ],
    "photos": [
      { "photo_url": "https://example.com/room1.jpg" }
    ]
  }'`}</Code>
                </div>

                <div>
                  <p className="font-medium text-sm mb-2">成功回應 (201)</p>
                  <Code>{`{
  "data": {
    "id": "uuid",
    "accommodation_id": "uuid",
    "name": "海景雙人房",
    "capacity": 2,
    "base_price": 3800,
    "room_amenities": [...],
    "room_photos": [...],
    "created_at": "2026-04-18T...",
    ...
  }
}`}</Code>
                </div>
              </CardContent>
            </Card>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">錯誤碼</h2>
            <Code>{`401  Missing or invalid API key
400  Validation failed (欄位錯誤)
404  Resource not found
500  Server error`}</Code>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">注意事項</h2>
            <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
              <li>金鑰僅綁定單一民宿，無法跨民宿操作。</li>
              <li>圖片需自行上傳至公開可存取的 URL（如 CDN、物件儲存）。</li>
              <li>建立後若需設定每日房價與庫存，請至「房價月曆」管理。</li>
              <li>請勿將 API Key 提交至公開程式碼倉庫或暴露於前端。</li>
            </ul>
          </section>
        </main>
      </div>
    </>
  );
}
