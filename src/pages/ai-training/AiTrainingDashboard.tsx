import { useEffect, useState } from "react";
import { MessagesSquare, Star, BookOpen, GitBranch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface Stats {
  todayConversations: number;
  weekAvgRating: string;
  knowledgeCount: number;
  promptVersion: string;
}

export default function AiTrainingDashboard() {
  const [stats, setStats] = useState<Stats>({
    todayConversations: 0,
    weekAvgRating: "—",
    knowledgeCount: 0,
    promptVersion: "v0",
  });

  useEffect(() => {
    void (async () => {
      const [kbRes, promptRes] = await Promise.all([
        supabase.from("ai_knowledge").select("id", { count: "exact", head: true }),
        supabase
          .from("ai_prompts")
          .select("version")
          .eq("status", "published")
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      setStats((s) => ({
        ...s,
        knowledgeCount: kbRes.count ?? 0,
        promptVersion: promptRes.data ? `v${promptRes.data.version}` : "v0",
      }));
    })();
  }, []);

  const cards = [
    { title: "今日對話數", value: stats.todayConversations, icon: MessagesSquare },
    { title: "本週平均評分", value: stats.weekAvgRating, icon: Star },
    { title: "知識庫條目數", value: stats.knowledgeCount, icon: BookOpen },
    { title: "目前提示詞版本", value: stats.promptVersion, icon: GitBranch },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">總覽</h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI 找房助理「小安」的訓練成效概況。
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {c.title}
              </CardTitle>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
