import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Code, Shield, FileText, Zap, Lock, Server } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";

const PROJECT_ID = "dmafqwfynatdvnaeovhz";
const ENDPOINT = `https://${PROJECT_ID}.supabase.co/functions/v1/accommodation-ai-chat`;

const Pre = ({ children }: { children: React.ReactNode }) => (
  <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-xs leading-relaxed font-mono">
    {children}
  </pre>
);

export default function AdminAiTrainingApiDocs() {
  return (
    <>
      <SEOHead title="AI 管家 API 文件" description="民宿 AI 管家 Chat API 串接文件" />
      <div className="space-y-8 max-w-4xl">
        <div>
          <h1 className="text-2xl font-semibold">AI 管家 API 文件</h1>
          <p className="text-sm text-muted-foreground mt-1">
            供台灣旅圖等外部平台串接本民宿 AI 管家。所有對話會以串流（SSE）方式回傳。
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
            到「API 金鑰」頁面建立金鑰，於每次請求帶上：
          </p>
          <Pre>x-api-key: acc_ai_xxxxxxxxxxxxxxxxxxxxxxxxxxxx</Pre>
          <p className="text-xs text-muted-foreground">每分鐘預設 30 次請求（可在金鑰建立時調整）。</p>
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
          <h2 className="text-lg font-semibold">訓練資料維護</h2>
          <p className="text-sm text-muted-foreground">
            AI 回應品質取決於後台訓練資料。請定期到以下頁面更新：
          </p>
          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
            <li><strong>系統提示詞</strong>：定義 AI 人格、語氣、禁忌主題</li>
            <li><strong>知識庫</strong>：房型、設施、政策、常見問答</li>
            <li><strong>對話範例</strong>：示範特定情境的理想回應</li>
            <li><strong>對話紀錄</strong>：檢視外部呼叫產生的對話品質</li>
          </ul>
        </section>
      </div>
    </>
  );
}
