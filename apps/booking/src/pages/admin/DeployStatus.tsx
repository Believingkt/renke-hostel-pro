import { AdminPageHeader } from "@lakeze/shared/components/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Separator } from "@lakeze/shared/components/ui/separator";
import { Server, ShieldCheck, Database, Cloud, Route } from "lucide-react";

// 內容對照程式實際設定（supabase/functions、supabase/migrations）填寫；調整功能時請同步更新。
const INFO_CARDS = [
  {
    icon: Server,
    title: "系統架構",
    items: [
      ["前端", "雲端託管之 React SPA（React 18 + Vite 5 + TypeScript）"],
      ["樣式系統", "Tailwind CSS v3 + shadcn/ui"],
      ["服務端", "Supabase 託管：Edge Functions（Deno）＋ PostgreSQL"],
      ["身分驗證", "Supabase Auth（Email OTP／密碼）、LINE LIFF 綁定"],
    ],
  },
  {
    icon: Database,
    title: "資料層",
    items: [
      ["資料庫", "Supabase PostgreSQL"],
      ["存取控制", "Row Level Security（traveler_attributes、trips、trip_generations、trip_products 等皆啟用）"],
      ["旅遊屬性", "traveler_attributes（/trips/guide 對話導引、LINE 管家歸檔）"],
      ["行程資料", "trip_templates（情境模板）、trip_products（景點／商品）、trips（已發布行程）、trip_generations（生成快照）"],
    ],
  },
  {
    icon: Cloud,
    title: "C2 服務端函式（對話導引）",
    items: [
      ["對話導引", "traveler-guide"],
      ["平台 AI 管家", "portal-ai-chat"],
      ["流量限制", "traveler-guide 每 IP 每分鐘 30 次；portal-ai-chat 每 IP 每分鐘 20 次"],
      ["CORS", "Access-Control-Allow-Origin: *（公開前台端點）"],
    ],
  },
  {
    icon: Route,
    title: "C3 服務端函式（智能行程推薦）",
    items: [
      ["行程推薦", "trip-recommend（每 IP 每分鐘 20 次）"],
      ["前台入口", "/trips/templates、/trips/generate、官網小安 [TRIP_CARDS]、LINE 管家行程卡"],
      ["情境模板", "家庭親子／情侶約會／好友出遊／包棟聚會／戶外探索"],
      ["排序規則", "建議時段 → 各點營業時間窗 → 同時段內最短路徑（貪婪最近鄰）"],
      ["多語", "trip_templates.name、trips.title 以 jsonb {zh, ja, en} 儲存"],
    ],
  },
  {
    icon: ShieldCheck,
    title: "安全與稽核",
    items: [
      ["金鑰保管", "LLM 與服務金鑰存於 Supabase Edge Function Secrets，前端不可見"],
      ["訪客紀錄", "匿名以工作階段代碼（session_id）記錄，不含個資"],
      ["管理權限", "管理員／最高管理員（RLS is_admin_or_super）可檢視全部旅遊屬性"],
      ["資料保留", "traveler_attributes、trip_generations 由服務端以 insert 寫入，不覆寫歷史紀錄"],
    ],
  },
];

const PROGRESS: Array<{ label: string; done: boolean }> = [
  { label: "C2 對話導引 · 已上線", done: true },
  { label: "C3 智能推薦 · 已上線", done: true },
];

const DeployStatus = () => {
  return (
    <div className="space-y-4" data-testid="deploy-status-page">
      <AdminPageHeader title="部署佐證" description="C2 動態行旅導引／C3 智能行程推薦模組部署資訊卡" icon={Server} />

      <div className="grid gap-4 md:grid-cols-2">
        {INFO_CARDS.map((card) => (
          <Card key={card.title}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <card.icon className="h-4 w-4 text-primary" />
                {card.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {card.items.map(([k, v], i) => (
                <div key={k}>
                  {i > 0 && <Separator className="mb-2" />}
                  <div className="flex items-start justify-between gap-4 text-sm">
                    <span className="text-muted-foreground shrink-0">{k}</span>
                    <span className="text-right font-medium">{v}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">模組進度</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2" data-testid="deploy-status-progress">
          {PROGRESS.map((p) => (
            <Badge key={p.label} variant={p.done ? "default" : "secondary"}>{p.label}</Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default DeployStatus;
