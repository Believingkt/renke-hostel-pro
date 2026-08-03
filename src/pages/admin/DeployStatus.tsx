import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Server, ShieldCheck, Database, Cloud } from "lucide-react";

const INFO_CARDS = [
  {
    icon: Server,
    title: "部署主機（Level 1）",
    items: [
      ["主機類型", "Windows Server 主機"],
      ["部署層級", "Level 1（靜態佐證）"],
      ["前端框架", "React 18 + Vite 5 + TypeScript"],
      ["樣式系統", "Tailwind CSS v3 + shadcn/ui"],
    ],
  },
  {
    icon: Database,
    title: "資料層",
    items: [
      ["資料庫", "PostgreSQL（雲端後端）"],
      ["存取控制", "Row Level Security（全表啟用）"],
      ["新增資料表", "traveler_attributes（旅遊屬性）"],
      ["歸檔來源", "/trips/guide 對話導引"],
    ],
  },
  {
    icon: Cloud,
    title: "服務端函式",
    items: [
      ["對話導引", "traveler-guide"],
      ["平台 AI 管家", "portal-ai-chat"],
      ["流量限制", "每 IP 每分鐘 30 次"],
      ["CORS", "已開放前台網域呼叫"],
    ],
  },
  {
    icon: ShieldCheck,
    title: "安全與稽核",
    items: [
      ["金鑰保管", "伺服端環境變數，前端不可見"],
      ["訪客紀錄", "以工作階段代碼記錄，不含個資"],
      ["管理權限", "管理員／最高管理員可檢視全部"],
      ["資料保留", "append-only，不覆寫歷史紀錄"],
    ],
  },
];

const DeployStatus = () => {
  return (
    <div className="space-y-4">
      <AdminPageHeader title="部署佐證" description="C2 動態行旅導引推薦模組部署資訊卡" icon={Server} />

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
        <CardContent className="flex flex-wrap gap-2">
          <Badge>C2 對話導引 · 已完成</Badge>
          <Badge variant="secondary">C3 智能推薦 · 尚未開始</Badge>
        </CardContent>
      </Card>
    </div>
  );
};

export default DeployStatus;
