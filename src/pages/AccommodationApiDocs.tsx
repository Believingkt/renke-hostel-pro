import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText, Lock, Server, Zap, Copy, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";
import { useState } from "react";
import { toast } from "sonner";
import { AvailabilityTryIt } from "@/components/docs/AvailabilityTryIt";

const BASE_URL = "https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/accommodation-api";

function CodeBlock({ children, label }: { children: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      toast.success("已複製到剪貼簿");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("複製失敗，請手動選取");
    }
  };
  return (
    <div className="rounded-md border bg-muted/40 relative group">
      {label ? (
        <div className="px-3 py-1.5 border-b text-[11px] font-mono text-muted-foreground bg-muted/60 flex items-center justify-between gap-2">
          <span className="truncate">{label}</span>
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 gap-1 text-[11px] -my-1 shrink-0" onClick={handleCopy}>
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "已複製" : "複製"}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 gap-1 text-[11px] absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 z-10"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "已複製" : "複製"}
        </Button>
      )}
      <pre className="text-[12px] font-mono p-3 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
}

const TOC = [
  { id: "overview", label: "1. 概述" },
  { id: "base-url", label: "2. Base URL" },
  { id: "auth", label: "3. 認證" },
  { id: "availability", label: "4. GET /availability（查價格 + 庫存）" },
  { id: "try-it", label: "5. Try it out（互動測試）" },
  { id: "room-types", label: "6. GET /room-types（列全部房型）" },
  { id: "room-type-detail", label: "7. GET /room-types/{id}" },
  { id: "errors", label: "8. 錯誤碼表" },
  { id: "notes", label: "9. 備註與注意事項" },
  { id: "openapi", label: "10. OpenAPI / Swagger" },
];

const OPENAPI_JSON_URL = "/docs/accommodation-api.openapi.json";
const SWAGGER_UI_URL = "/docs/accommodation-api-swagger.html";

export default function AccommodationApiDocs() {
  return (
    <>
      <SEOHead
        title="民宿房型 API 開放文件 | Accommodation API"
        description="供外部系統（Bot、Channel Manager、旅遊平台）串接民宿房型、房價、庫存的公開 API 文件。"
      />
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4 flex items-center gap-4">
            <Link to="/api-docs">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" /> API 文件中心
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold">民宿 API — 公開文件</h1>
              <p className="text-sm text-muted-foreground">Accommodation API · Public Reference</p>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
            {/* TOC */}
            <aside className="hidden lg:block">
              <nav className="sticky top-24 space-y-1 text-sm">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">目錄</p>
                {TOC.map((t) => (
                  <a
                    key={t.id}
                    href={`#${t.id}`}
                    className="block px-2 py-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t.label}
                  </a>
                ))}
              </nav>
            </aside>

            <div className="space-y-10 min-w-0">
              {/* Overview */}
              <section id="overview" className="scroll-mt-24">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />API 概述</CardTitle>
                    <CardDescription>供外部串接（Bot、Channel Manager、旅遊平台）查詢房型、房價與庫存的唯讀 API。</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid sm:grid-cols-3 gap-4">
                      <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                        <Server className="h-5 w-5 text-primary mt-0.5" />
                        <div><p className="font-medium">RESTful</p><p className="text-sm text-muted-foreground">JSON over HTTPS</p></div>
                      </div>
                      <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                        <Lock className="h-5 w-5 text-primary mt-0.5" />
                        <div><p className="font-medium">API Key 驗證</p><p className="text-sm text-muted-foreground">一把 Key 綁定一館</p></div>
                      </div>
                      <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                        <Zap className="h-5 w-5 text-primary mt-0.5" />
                        <div><p className="font-medium">即時同步</p><p className="text-sm text-muted-foreground">與官網 / 點數訂房共用邏輯</p></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </section>

              {/* Base URL */}
              <section id="base-url" className="scroll-mt-24">
                <h2 className="text-lg font-semibold mb-3">Base URL</h2>
                <CodeBlock label="Base URL">{BASE_URL}</CodeBlock>
              </section>

              {/* Auth */}
              <section id="auth" className="scroll-mt-24 space-y-3">
                <h2 className="text-lg font-semibold">認證</h2>
                <p className="text-sm text-muted-foreground">
                  所有請求必須帶入 API Key。金鑰由平台後台發放，<strong>一把 Key 僅綁定單一民宿</strong>，只能查回該館資料，跨館請求會被拒絕。
                  請務必<strong>放在後端呼叫</strong>，切勿暴露於前端程式碼、App Bundle、或 Git Repo。
                </p>
                <CodeBlock label="方式一：x-api-key Header（推薦）">{`x-api-key: acc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</CodeBlock>
                <CodeBlock label="方式二：Authorization Bearer">{`Authorization: Bearer acc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</CodeBlock>
              </section>

              {/* Availability */}
              <section id="availability" className="scroll-mt-24">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">GET</Badge>
                      <code className="text-sm">/availability</code>
                    </div>
                    <CardDescription>查詢指定日期區間內每一天的<strong>剩餘可售房量、房價、開關房狀態</strong>。這是外部 Bot 最常用的端點。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="font-medium text-sm mb-2">Query 參數</p>
                      <div className="rounded-lg border overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left p-3">參數</th>
                              <th className="text-left p-3">型別</th>
                              <th className="text-left p-3">必填</th>
                              <th className="text-left p-3">說明</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            <tr><td className="p-3"><code>from</code></td><td className="p-3">string</td><td className="p-3">是</td><td className="p-3">起始日期 <code>YYYY-MM-DD</code>（含當日）</td></tr>
                            <tr><td className="p-3"><code>to</code></td><td className="p-3">string</td><td className="p-3">是</td><td className="p-3">結束日期 <code>YYYY-MM-DD</code>（含當日）。需 ≥ <code>from</code>，區間最多 <strong>60 天</strong></td></tr>
                            <tr><td className="p-3"><code>room_type_id</code></td><td className="p-3">string</td><td className="p-3">否</td><td className="p-3">房型 ID，可用逗號分隔多個；未帶則回本館全部房型。不屬於本館的 ID 會被忽略</td></tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <p className="font-medium text-sm mb-2">cURL 範例</p>
                      <CodeBlock label="查全部房型">{`curl -X GET '${BASE_URL}/availability?from=2026-07-01&to=2026-07-07' \\
  -H 'x-api-key: YOUR_API_KEY'`}</CodeBlock>
                      <div className="h-2" />
                      <CodeBlock label="查指定房型">{`curl -X GET '${BASE_URL}/availability?from=2026-07-01&to=2026-07-07&room_type_id=<ID1>,<ID2>' \\
  -H 'x-api-key: YOUR_API_KEY'`}</CodeBlock>
                    </div>

                    <div>
                      <p className="font-medium text-sm mb-2">回應範例 (200)</p>
                      <CodeBlock label="application/json">{`{
  "accommodation_id": "uuid",
  "from": "2026-07-01",
  "to": "2026-07-03",
  "currency": "TWD",
  "room_types": [
    {
      "room_type_id": "uuid",
      "name": "海景雙人房",
      "capacity": 2,
      "days": [
        { "date": "2026-07-01", "remaining": 2, "price": 3800, "is_available": true,  "closed": false },
        { "date": "2026-07-02", "remaining": 3, "price": 3800, "is_available": true,  "closed": false },
        { "date": "2026-07-03", "remaining": 0, "price": null, "is_available": false, "closed": true  }
      ]
    }
  ]
}`}</CodeBlock>
                    </div>

                    <div>
                      <p className="font-medium text-sm mb-2">欄位說明</p>
                      <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                        <li><code>remaining</code>：當日剩餘可售房量（已扣除既有訂單與包棟互斥佔用），關房或滿房為 <code>0</code>。</li>
                        <li><code>price</code>：當日房價（整數 TWD）；關房、未設定價格、或當日 tier 未啟用時為 <code>null</code>。</li>
                        <li><code>is_available</code>：當日是否開放銷售；<code>closed=true</code> 時必為 <code>false</code>。</li>
                        <li><code>closed</code>：<code>true</code> 表示因庫存關房、整棟保留或包棟互斥而不可銷售。</li>
                        <li><code>days</code>：一定會補滿 <code>from</code> ~ <code>to</code> 整段連續日期，前端可直接以陣列 index 對應。</li>
                      </ul>
                    </div>

                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-md text-sm">
                      <p className="font-medium mb-1">✅ 判斷「這一晚可訂」</p>
                      <code className="text-xs">closed === false &amp;&amp; remaining &gt; 0 &amp;&amp; price !== null</code>
                    </div>
                  </CardContent>
                </Card>
              </section>

              {/* Try it out */}
              <section id="try-it" className="scroll-mt-24">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" />Try it out — 互動測試 /availability</CardTitle>
                    <CardDescription>
                      直接在瀏覽器呼叫正式 API。輸入你的 API Key、選日期，一鍵送出即可看到真實回應與耗時。
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AvailabilityTryIt />
                  </CardContent>
                </Card>
              </section>

              {/* Room types list */}
              <section id="room-types" className="scroll-mt-24">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">GET</Badge>
                      <code className="text-sm">/room-types</code>
                    </div>
                    <CardDescription>列出此民宿全部房型（含 <code>room_amenities</code> 與 <code>room_photos</code>）。建議<strong>先呼叫此端點拿到房型 ID</strong>，再帶入 <code>/availability</code> 查價量。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <CodeBlock label="cURL">{`curl -X GET '${BASE_URL}/room-types' \\
  -H 'x-api-key: YOUR_API_KEY'`}</CodeBlock>
                    <CodeBlock label="回應範例 (200)">{`{
  "data": [
    {
      "id": "uuid",
      "accommodation_id": "uuid",
      "name": "海景雙人房",
      "name_en": "Ocean View Double",
      "description": "面海景觀套房",
      "capacity": 2,
      "base_price": 3800,
      "room_count": 3,
      "size_sqm": 12.5,
      "display_order": 0,
      "room_amenities": [
        { "category": "general", "amenity_name": "空調" }
      ],
      "room_photos": [
        { "photo_url": "https://.../room1.jpg", "display_order": 0 }
      ]
    }
  ]
}`}</CodeBlock>
                  </CardContent>
                </Card>
              </section>

              {/* Room type detail */}
              <section id="room-type-detail" className="scroll-mt-24">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">GET</Badge>
                      <code className="text-sm">/room-types/{"{id}"}</code>
                    </div>
                    <CardDescription>取得單一房型詳情。若 <code>id</code> 不屬於本館或不存在，回 <code>404 Room type not found</code>。</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CodeBlock label="cURL">{`curl -X GET '${BASE_URL}/room-types/<ROOM_TYPE_ID>' \\
  -H 'x-api-key: YOUR_API_KEY'`}</CodeBlock>
                  </CardContent>
                </Card>
              </section>

              {/* Errors */}
              <section id="errors" className="scroll-mt-24">
                <h2 className="text-lg font-semibold mb-3">錯誤碼表</h2>
                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-3">HTTP</th>
                        <th className="text-left p-3">狀況</th>
                        <th className="text-left p-3">訊息 / 說明</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      <tr><td className="p-3"><Badge variant="destructive">401</Badge></td><td className="p-3">未帶 API Key 或無效</td><td className="p-3"><code>Missing API key</code> / <code>Invalid API key</code></td></tr>
                      <tr><td className="p-3"><Badge variant="secondary">400</Badge></td><td className="p-3">參數錯誤</td><td className="p-3"><code>from and to are required</code> / <code>Invalid date format, expected YYYY-MM-DD</code> / <code>to must be greater than or equal to from</code> / <code>Date range too large (max 60 days)</code></td></tr>
                      <tr><td className="p-3"><Badge variant="outline">404</Badge></td><td className="p-3">房型不存在或不屬於本館</td><td className="p-3"><code>Room type not found</code></td></tr>
                      <tr><td className="p-3"><Badge variant="destructive">500</Badge></td><td className="p-3">伺服器錯誤</td><td className="p-3"><code>Internal server error</code>（請重試或回報）</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-3">
                  <CodeBlock label="錯誤回應格式">{`{ "error": "Date range too large (max 60 days)" }`}</CodeBlock>
                </div>
              </section>

              {/* Notes */}
              <section id="notes" className="scroll-mt-24">
                <h2 className="text-lg font-semibold mb-3">備註與注意事項</h2>
                <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
                  <li>幣別固定為 <strong>TWD</strong>；價格為整數（新台幣）。</li>
                  <li>日期一律以<strong>民宿當地日期</strong>解讀，回應不含時區位移，直接使用 <code>YYYY-MM-DD</code>。</li>
                  <li><code>remaining</code> 為即時查詢值，隨訂單成立/取消動態變化，請每次串接前重新查詢，切勿長期快取。</li>
                  <li>本 API 為<strong>唯讀查詢</strong>，不會建立訂單、不會扣房；下單請走專屬訂房流程。</li>
                  <li>房量、房價、關房規則與官網訂房、點數訂房共用同一套邏輯（庫存扣房、包棟互斥、tier 解價、房型 override、季節分段、餐型模板），資料保證一致。</li>
                  <li>請將 API Key 存放於後端伺服器環境變數；勿放入前端或提交至公開 Git Repo。</li>
                </ul>
              </section>

              {/* OpenAPI / Swagger */}
              <section id="openapi" className="scroll-mt-24">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />OpenAPI (Swagger) 規格</CardTitle>
                    <CardDescription>
                      本 API 提供 OpenAPI 3.0 規格檔，可直接匯入 Postman / Insomnia / openapi-generator 產生 client SDK。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <a href={OPENAPI_JSON_URL} download="accommodation-api.openapi.json">
                        <Button variant="default" size="sm" className="gap-2">
                          <Copy className="h-4 w-4" /> 下載 openapi.json
                        </Button>
                      </a>
                      <a href={OPENAPI_JSON_URL} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">在新分頁開啟 JSON</Button>
                      </a>
                      <a href={SWAGGER_UI_URL} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">在新分頁開啟 Swagger UI</Button>
                      </a>
                    </div>
                    <CodeBlock label="OpenAPI JSON URL">{`${typeof window !== "undefined" ? window.location.origin : "https://renke-hostel-pro.lovable.app"}${OPENAPI_JSON_URL}`}</CodeBlock>
                    <div className="rounded-lg border overflow-hidden bg-white">
                      <iframe
                        src={SWAGGER_UI_URL}
                        title="Accommodation API Swagger UI"
                        className="w-full"
                        style={{ height: "820px", border: 0 }}
                        loading="lazy"
                      />
                    </div>
                  </CardContent>
                </Card>
              </section>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
