import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { MessagesSquare, BookOpen, FileText, KeyRound } from "lucide-react";

export default function AdminAiTrainingDashboard() {
  const { currentAccommodationId } = useAccommodation();
  const [stats, setStats] = useState({ logs: 0, knowledge: 0, prompts: 0, keys: 0 });

  useEffect(() => {
    if (!currentAccommodationId) return;
    void (async () => {
      const [logs, knowledge, prompts, keys] = await Promise.all([
        supabase.from("ai_conversation_logs").select("id", { count: "exact", head: true })
          .eq("accommodation_id", currentAccommodationId),
        supabase.from("ai_knowledge").select("id", { count: "exact", head: true })
          .eq("accommodation_id", currentAccommodationId).eq("is_active", true),
        supabase.from("ai_prompts").select("id", { count: "exact", head: true })
          .eq("accommodation_id", currentAccommodationId),
        supabase.from("accommodation_ai_api_keys").select("id", { count: "exact", head: true })
          .eq("accommodation_id", currentAccommodationId).eq("is_active", true),
      ]);
      setStats({
        logs: logs.count ?? 0,
        knowledge: knowledge.count ?? 0,
        prompts: prompts.count ?? 0,
        keys: keys.count ?? 0,
      });
    })();
  }, [currentAccommodationId]);

  const cards = [
    { label: "對話紀錄總數", value: stats.logs, icon: MessagesSquare },
    { label: "知識條目（啟用）", value: stats.knowledge, icon: BookOpen },
    { label: "提示詞版本數", value: stats.prompts, icon: FileText },
    { label: "API 金鑰（啟用）", value: stats.keys, icon: KeyRound },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AI 管家總覽</h1>
        <p className="text-sm text-muted-foreground mt-1">
          管理本民宿的 AI 訓練資料、測試對話品質，並透過 API 串接到台灣旅圖等外部平台。
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <c.icon className="h-4 w-4" />
              <span className="text-xs">{c.label}</span>
            </div>
            <div className="text-2xl font-semibold">{c.value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="text-lg font-semibold mb-3">快速開始</h2>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
          <li>到「<strong>系統提示詞</strong>」設定 AI 管家的人格、語氣與禁忌主題。</li>
          <li>到「<strong>知識庫</strong>」匯入民宿房型、設施、政策等資料。</li>
          <li>用「<strong>即時測試</strong>」驗證 AI 回應品質。</li>
          <li>到「<strong>API 金鑰</strong>」產生金鑰，提供給台灣旅圖串接。</li>
          <li>把「<strong>API 文件</strong>」連結交給對方工程師即可上線。</li>
        </ol>
      </Card>
    </div>
  );
}
