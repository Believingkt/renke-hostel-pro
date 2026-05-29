import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Code, Shield, FileText, Zap, Lock, Server } from "lucide-react";
import { Link } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const ENDPOINT = `https://${PROJECT_ID}.supabase.co/functions/v1/accommodation-ai-chat`;

const Pre = ({ children }: { children: React.ReactNode }) => (
  <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-xs leading-relaxed font-mono">
    {children}
  </pre>
);

export default function AccommodationAiApiDocs() {
  return (
    <>
      <SEOHead
        title="民宿 AI 管家 API 文件 | Accommodation AI Chat API"
        description="供台灣旅圖等外部平台串接民宿 AI 管家的開發文件"
      />
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4 flex items-center gap-4">
            <Link to="/api-docs">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" /> 返回 API 中心
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold">民宿 AI 管家 API 文件</h1>
              <p className="text-sm text-muted-foreground">Accommodation AI Chat API</p>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 max-w-4xl space-y-8">
          <div>
            <p className="text-sm text-muted-foreground">
              供台灣旅圖等外部平台串接本民宿 AI 管家。所有對話會以串流（SSE）方式回傳，介面相容 OpenAI Chat Completion 格式。
              請向所欲串接的民宿索取專屬 API 金鑰。
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />API 概述</CardTitle>
              <CardDescription>OpenAI 相容的 SSE streaming chat completion API</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                  <Server className="h-5 w-5 text-primary mt-0.5" />
                  <div><p className="font-medium">RESTful</p><p className="text-sm text-muted-foreground">標準 POST 介面</p></div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                  <Lock className="h-5 w-5 text-primary mt-0.5" />
                  <div><p className="font-medium">API Key 驗證</p><p className="text-sm text-muted-foreground">x-api-key Header</p></div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                  <Zap className="h-5 w-5 text-primary mt-0.5" />
                  <div><p className="font-medium">SSE 串流</p><p className="text-sm text-muted-foreground">即時逐字回應</p></div>
                </div>
              </div>
            </CardContent>
          </Card>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Code className="h-5 w-5" />端點</h2>
            <Pre>POST {ENDPOINT}</Pre>
          </section>

          <Separator />

          <section className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Shield className="h-5 w-5" />認證</h2>
            <p className="text-sm text-muted-foreground">
              每個民宿會於其後台「AI 管家 → API 金鑰」頁面建立金鑰，請於每次請求帶上：
            </p>
            <Pre>x-api-key: acc_ai_xxxxxxxxxxxxxxxxxxxxxxxxxxxx</Pre>
            <p className="text-xs text-muted-foreground">每分鐘預設 30 次請求（可由民宿後台調整）。金鑰即代表對應民宿，請妥善保管，勿置於前端程式碼。</p>
          </section>

          <Separator />

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">請求格式</h2>
            <Pre>{`{
  "messages": [
    { "role": "user", "content": "你們有適合 4 人的房型嗎？" }
  ],
  "session_id": "optional-uuid-for-tracking"
}`}</Pre>
            <div className="text-sm space-y-2">
              <Label>欄位說明</Label>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1 text-sm">
                <li><code>messages</code>：對話歷史陣列，<code>role</code> 為 <code>user</code> 或 <code>assistant</code>。請保留完整歷史以維持對話上下文。</li>
                <li><code>session_id</code>（選填）：對話追蹤 ID，便於後台串連同一段對話。未提供則自動產生。</li>
              </ul>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">回應格式（SSE）</h2>
            <p className="text-sm text-muted-foreground">
              Content-Type: <code>text/event-stream</code>，每筆 <code>data:</code> 為 OpenAI 相容 chunk：
            </p>
            <Pre>{`data: {"choices":[{"delta":{"content":"您"}}]}
data: {"choices":[{"delta":{"content":"好"}}]}
data: {"choices":[{"delta":{"content":"，我"}}]}
...
data: [DONE]`}</Pre>
          </section>

          <Separator />

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">範例：cURL</h2>
            <Pre>{`curl -N -X POST '${ENDPOINT}' \\
  -H 'x-api-key: YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "messages": [
      { "role": "user", "content": "你們民宿有附早餐嗎？" }
    ]
  }'`}</Pre>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">範例：JavaScript (fetch + SSE)</h2>
            <Pre>{`const res = await fetch('${ENDPOINT}', {
  method: 'POST',
  headers: {
    'x-api-key': 'YOUR_API_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    messages: [{ role: 'user', content: '你們有寵物房嗎？' }],
  }),
});

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  const lines = buf.split('\\n');
  buf = lines.pop() || '';
  for (const line of lines) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') continue;
    const json = JSON.parse(payload);
    const delta = json.choices?.[0]?.delta?.content;
    if (delta) process.stdout.write(delta);
  }
}`}</Pre>
          </section>

          <Separator />

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">錯誤碼</h2>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr><th className="text-left p-3">代碼</th><th className="text-left p-3">說明</th></tr>
                </thead>
                <tbody className="divide-y">
                  <tr><td className="p-3"><code>400</code></td><td className="p-3">請求格式錯誤（messages 缺失、訊息過長等）</td></tr>
                  <tr><td className="p-3"><code>401</code></td><td className="p-3">API 金鑰無效或缺失</td></tr>
                  <tr><td className="p-3"><code>403</code></td><td className="p-3">無權存取該民宿</td></tr>
                  <tr><td className="p-3"><code>429</code></td><td className="p-3">超過速率限制</td></tr>
                  <tr><td className="p-3"><code>402</code></td><td className="p-3">AI 服務額度用盡，請聯繫人客多</td></tr>
                  <tr><td className="p-3"><code>502</code></td><td className="p-3">AI 服務暫時無法回應</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <Separator />

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">最佳實踐</h2>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              <li>每位終端使用者建立獨立的 <code>session_id</code>，便於後台分析個別對話。</li>
              <li>保留完整 <code>messages</code> 歷史，以維持多輪對話上下文。</li>
              <li>API 金鑰僅儲存於後端伺服器，絕勿暴露於前端瀏覽器。</li>
              <li>串流請以逐 chunk 解析，避免一次性等待完整回應。</li>
              <li>實作 429 / 502 的重試與指數退避機制。</li>
            </ul>
          </section>
        </main>
      </div>
    </>
  );
}
